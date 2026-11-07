import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {getLlama, LlamaLogLevel, GgufInsights} from "node-llama-cpp";
import {
    CACHE_DIR,
    DEFAULT_MODEL_ID,
    getModel,
    getDefaultModel,
    cachePathFor,
    isCached
} from "./catalog.js";
import {fetchModelToCache, removeCachedModel} from "./cache.js";

/**
 * Owns exactly one loaded model at a time and can swap between them.
 *
 * Loading is swap-then-dispose: the incoming model is loaded *before* the outgoing one is
 * released. Doing it the other way round means a failed load leaves the app with no model
 * at all. The tradeoff is that both are resident briefly, so the swap is refused when the
 * machine does not have room for both — better a clear error than an OOM crash.
 */

const CONTEXT_CANDIDATES = [4096, 2048, 1024, 512];
const RAM_SAFETY_FACTOR = 0.85;
const RUNTIME_OVERHEAD_BYTES = 160 * 1024 * 1024;

let status = {
    phase: "idle",
    message: "No model is loaded.",
    modelId: null,
    downloadedBytes: 0,
    totalBytes: 0,
    device: null,
    contextSize: null,
    freeRamBytes: null,
    error: null
};

const listeners = new Set();
let changeListeners = new Set();

let llamaRef = null;
let loaded = null;        // {model, context, id}
let readyPromise = null;
let activeModelId = null;
let swapChain = Promise.resolve();

export function getStatus() {
    return {...status};
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Fires whenever the active model changes (or is released). */
export function onModelChange(listener) {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
}

function update(patch) {
    status = {...status, ...patch};
    for (const listener of listeners) listener(getStatus());
}

function notifyChange() {
    const id = activeModelId;
    const model = id != null ? getModel(id) : null;
    for (const listener of changeListeners) listener({modelId: id, model});
}

/* --------------------------------- reading --------------------------------- */

export function getActiveModelId() {
    return activeModelId;
}

export function isReady() {
    return status.phase === "ready" && loaded != null;
}

export function getLoaded() {
    return loaded;
}

export function getContext() {
    return loaded?.context ?? null;
}

/** Prompt-derived token count, used to keep the KV cache from overflowing. */
export function countTokens(text) {
    try {
        return loaded?.model.tokenize(text).length ?? 0;
    } catch {
        return 0;
    }
}

/* --------------------------------- loading --------------------------------- */

/**
 * Ensure the default (or given) model is loaded. Concurrent callers share one operation.
 */
export function ensureModel(modelId = activeModelId ?? getDefaultModel().id) {
    // Already loaded: nothing to do. The promise is only non-null while loading, so this
    // check has to be explicit — otherwise an already-ready model re-enters the loader.
    if (loaded != null && loaded.id === modelId) return Promise.resolve(loaded);

    if (readyPromise != null) return readyPromise;

    readyPromise = loadModelInternal(modelId)
        .catch(error => {
            update({
                phase: "error",
                message: "The model could not be loaded.",
                error: error?.message ?? String(error)
            });
            throw error;
        })
        .finally(() => {
            readyPromise = null;
        });

    return readyPromise;
}

/**
 * Download if necessary, then load. Serialized with swaps so two operations cannot
 * fight over the single loaded slot.
 */
export function loadModel(modelId) {
    const run = swapChain.then(() => loadModelInternal(modelId));
    swapChain = run.catch(() => {});
    return run;
}

async function loadModelInternal(modelId) {
    const model = getModel(modelId);
    if (model == null) throw new Error(`Unknown model "${modelId}".`);

    if (loaded != null && loaded.id === modelId) return loaded;

    await ensureCached(model);

    const previous = loaded;

    // Check there is room for both before we start, since loading precedes unloading.
    assertRoomForSwap(model, previous);

    update({
        phase: "loading",
        message: `Loading ${model.name}…`,
        modelId,
        error: null,
        downloadedBytes: 0,
        totalBytes: 0
    });

    const llama = llamaRef ?? await getLlama({logLevel: LlamaLogLevel.warn});
    llamaRef = llama;

    let next;
    try {
        const llamaModel = await llama.loadModel({modelPath: cachePathFor(model), useMmap: true});
        const contextSize = await pickContextSize(llamaModel, model);
        const context = await llamaModel.createContext({contextSize, sequences: 1});

        next = {id: modelId, model: llamaModel, context, contextSize};
    } catch (error) {
        update({phase: "error", message: `Could not load ${model.name}.`, error: error?.message ?? String(error)});
        throw error;
    }

    // Commit the swap, then release the previous model.
    loaded = next;
    activeModelId = modelId;

    update({
        phase: "ready",
        message: `${model.name} is ready.`,
        modelId,
        device: describeDevice(llama),
        contextSize: next.contextSize,
        freeRamBytes: os.freemem(),
        error: null
    });

    if (previous != null && previous !== next) {
        await release(previous);
        update({freeRamBytes: os.freemem()});
    }

    notifyChange();
    return loaded;
}

/**
 * Load a model without disturbing the currently loaded one. Used to prefetch while a
 * cached model is still answering questions.
 */
export async function preloadModel(modelId) {
    const model = getModel(modelId);
    if (model == null) throw new Error(`Unknown model "${modelId}".`);

    const existing = (await import("./model-manager.js")).getPreloaded?.(modelId);
    return existing ?? null;
}

async function ensureCached(model) {
    if (isCached(model)) return;

    fs.mkdirSync(CACHE_DIR, {recursive: true});

    update({
        phase: "downloading",
        message: `Caching ${model.name}…`,
        modelId: model.id,
        downloadedBytes: 0,
        totalBytes: model.sizeBytes ?? 0,
        error: null
    });

    await fetchModelToCache(model, {
        onProgress({downloadedBytes, totalBytes}) {
            const now = Date.now();
            if (now - (ensureCached.lastUpdate ?? 0) < 200 && downloadedBytes !== totalBytes) return;
            ensureCached.lastUpdate = now;
            update({downloadedBytes, totalBytes});
        }
    });

    notifyChange();
}

async function release(entry) {
    try {
        await entry.context?.dispose();
        await entry.model?.dispose();
    } catch {
        // Releasing is best-effort; a failure here must not block the swap.
    }
}

/* ------------------------------ install / unload ---------------------------- */

/**
 * Cache a model without loading it. The default model never needs this; it is how
 * additional models are made available.
 */
export function installModel(modelId) {
    const run = swapChain.then(async () => {
        const model = getModel(modelId);
        if (model == null) throw new Error(`Unknown model "${modelId}".`);
        await ensureCached(model);
        return {id: modelId, cached: true};
    });

    swapChain = run.catch(() => {});
    return run;
}

/** Delete a cached model. Refuses to remove the model currently in use. */
export function uninstallModel(modelId) {
    const run = swapChain.then(async () => {
        const model = getModel(modelId);
        if (model == null) throw new Error(`Unknown model "${modelId}".`);
        if (modelId === activeModelId) throw new Error("That model is in use. Switch to another model first.");

        removeCachedModel(model);
        notifyChange();
        return {id: modelId, cached: false};
    });

    swapChain = run.catch(() => {});
    return run;
}

/**
 * Free the loaded model. The next request loads it again from the cache — no download.
 */
export function unloadModel() {
    const run = swapChain.then(async () => {
        if (loaded == null) return {unloaded: false};

        const previous = loaded;
        loaded = null;
        activeModelId = null;

        await release(previous);

        update({
            phase: "idle",
            message: "Model unloaded. It will load again from the cache when needed.",
            modelId: null,
            device: null,
            contextSize: null,
            freeRamBytes: os.freemem(),
            error: null
        });

        notifyChange();
        return {unloaded: true};
    });

    swapChain = run.catch(() => {});
    return run;
}

/* -------------------------------- memory sizing ---------------------------- */

/**
 * Pick a context size from a budget. Pure function so the decision can be tested with
 * real model dimensions instead of whatever fixture happens to be on hand.
 */
export function chooseContextSize({freeRamBytes, weightsBytes, maxContextSize, estimateContextBytes}) {
    for (const contextSize of CONTEXT_CANDIDATES) {
        if (contextSize > maxContextSize) continue;

        const contextBytes = estimateContextBytes(contextSize);
        if (contextBytes == null) continue;

        if (weightsBytes + contextBytes + RUNTIME_OVERHEAD_BYTES <= freeRamBytes) {
            return {
                contextSize,
                reason: contextSize < maxContextSize ? "reduced to fit available memory" : "fits available memory"
            };
        }
    }

    return {
        contextSize: Math.min(512, maxContextSize),
        reason: "memory is very tight; using the smallest context, generation may be slow"
    };
}

/** Rough RAM needed by a model, used before committing to a swap. */
function estimateResidentBytes(model) {
    const weights = model.sizeBytes ?? 0;
    const kvPerToken = Number(model.kvBytesPerToken ?? 0);
    const context = Math.min(model.contextSize ?? 2048, 2048);
    return weights + kvPerToken * context + RUNTIME_OVERHEAD_BYTES;
}

function assertRoomForSwap(incoming, previous) {
    if (previous == null) return;

    const needed = estimateResidentBytes(incoming) + estimateResidentBytes(getModel(previous.id) ?? incoming);
    const available = os.freemem() + (previous.model?.size ?? 0);

    if (needed > available * RAM_SAFETY_FACTOR) {
        throw new Error(
            `Not enough memory to switch models: this needs about ${formatGb(needed)} but ` +
            `${formatGb(available)} is available. Unload the current model first ` +
            `(Settings → Unload), or switch on a machine with more RAM.`
        );
    }
}

function formatGb(bytes) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

async function pickContextSize(llamaModel, model) {
    const maxContextSize = Math.min(model.contextSize ?? 4096, llamaModel.trainContextSize);

    const requested = process.env.VOXELCHAT_CONTEXT_SIZE;
    if (requested != null) {
        const parsed = Number(requested);
        if (Number.isFinite(parsed) && parsed >= 256)
            return Math.min(Math.floor(parsed), maxContextSize);
        console.warn(`  Ignoring invalid VOXELCHAT_CONTEXT_SIZE="${requested}".`);
    }

    const estimateContextBytes = await createContextEstimator(llamaModel);
    if (estimateContextBytes == null) return Math.min(2048, maxContextSize);

    const {contextSize, reason} = chooseContextSize({
        freeRamBytes: os.freemem() * RAM_SAFETY_FACTOR,
        weightsBytes: llamaModel.size,
        maxContextSize,
        estimateContextBytes
    });

    console.log(`  ${model.name}: ${contextSize}-token context window (${reason}).`);
    return contextSize;
}

async function createContextEstimator(llamaModel) {
    let insights;
    try {
        insights = await GgufInsights.from(llamaModel.fileInfo, llamaModel.llama);
    } catch {
        return null;
    }

    const cache = new Map();

    return contextSize => {
        if (cache.has(contextSize)) return cache.get(contextSize);

        let bytes = null;
        try {
            const estimate = insights.estimateContextResourceRequirements({
                contextSize,
                modelGpuLayers: llamaModel.gpuLayers ?? 0
            });
            const value = Number(estimate?.cpuRam ?? estimate?.total ?? 0);
            bytes = value > 0 ? value : null;
        } catch {
            bytes = null;
        }

        cache.set(contextSize, bytes);
        return bytes;
    };
}

function describeDevice(llama) {
    try {
        return llama.gpu === false ? "CPU" : String(llama.gpu ?? "CPU").toUpperCase();
    } catch {
        return "CPU";
    }
}

/** Release everything on shutdown. */
export async function disposeAll() {
    swapChain = Promise.resolve();

    if (loaded != null) {
        const previous = loaded;
        loaded = null;
        activeModelId = null;
        await release(previous);
    }

    llamaRef = null;
    readyPromise = null;
}

export function setPhase(phase, message) {
    update({phase, message});
}

export {DEFAULT_MODEL_ID};
