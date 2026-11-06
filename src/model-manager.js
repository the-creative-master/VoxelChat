import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {getLlama, resolveModelFile, LlamaLogLevel, GgufInsights} from "node-llama-cpp";
import {ACTIVE_MODEL, MODELS_DIR, MODEL_PATH_OVERRIDE} from "./models.js";

/**
 * Context sizes to try, largest first. The KV cache grows linearly with this and is the
 * thing that decides whether the model fits in RAM, so we pick the biggest one that does.
 */
const CONTEXT_CANDIDATES = [4096, 2048, 1024, 512];

/** Leave this fraction of free RAM for everything else on the machine. */
const RAM_SAFETY_FACTOR = 0.85;

/** Runtime, tokenizer and compute-graph overhead that is not part of weights or KV cache. */
const RUNTIME_OVERHEAD_BYTES = 160 * 1024 * 1024;

/**
 * Lifecycle of the single model instance this server owns.
 *
 * phase: "idle" -> "downloading" -> "loading" -> "ready" | "error"
 */
let status = {
    phase: "idle",
    message: "Model has not been loaded yet.",
    downloadedBytes: 0,
    totalBytes: 0,
    device: null,
    contextSize: null,
    error: null
};

const listeners = new Set();

let llamaRef = null;
let modelRef = null;
let contextRef = null;
let readyPromise = null;
let lastProgressAt = 0;

export function getStatus() {
    return status;
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function update(patch) {
    status = {...status, ...patch};
    for (const listener of listeners) listener(status);
}

/**
 * Load (downloading first if needed) and return the shared model + context.
 * Concurrent callers share the same in-flight promise.
 */
export function ensureModel() {
    if (readyPromise != null) return readyPromise;

    readyPromise = load()
        .catch((error) => {
            readyPromise = null;
            update({
                phase: "error",
                message: "The model could not be loaded.",
                error: error?.message ?? String(error)
            });
            throw error;
        });

    return readyPromise;
}

export function isReady() {
    return status.phase === "ready" && contextRef != null;
}

export function getContext() {
    return contextRef;
}

async function load() {
    const modelPath = await resolveModelPath();

    update({phase: "loading", message: "Allocating the model in memory…", error: null, downloadedBytes: 0});

    const llama = await getLlama({logLevel: LlamaLogLevel.warn});
    const model = await llama.loadModel({modelPath});

    assertModelMatchesCatalog(model, modelPath);

    const contextSize = await pickContextSize(model);

    const context = await model.createContext({
        contextSize,
        sequences: 1
    });

    llamaRef = llama;
    modelRef = model;
    contextRef = context;

    update({
        phase: "ready",
        message: "SmolLM2 is ready.",
        device: describeDevice(llama),
        contextSize,
        freeRamBytes: os.freemem(),
        totalBytes: status.totalBytes
    });

    return {llama, model, context};
}

/**
 * Pick a context size from a budget. Pure function so the decision can be tested with
 * real SmolLM2 numbers instead of whatever fixture happens to be on hand.
 *
 * @param {object} options
 * @param {number} options.freeRamBytes   RAM we are willing to spend.
 * @param {number} options.weightsBytes   Resident size of the model weights.
 * @param {number} options.maxContextSize Upper bound (the model's trained window).
 * @param {(size: number) => (number|null)} options.estimateContextBytes
 * @returns {{contextSize: number, reason: string}}
 */
export function chooseContextSize({freeRamBytes, weightsBytes, maxContextSize, estimateContextBytes}) {
    for (const contextSize of CONTEXT_CANDIDATES) {
        if (contextSize > maxContextSize) continue;

        const contextBytes = estimateContextBytes(contextSize);
        if (contextBytes == null) continue;

        const total = weightsBytes + contextBytes + RUNTIME_OVERHEAD_BYTES;
        if (total <= freeRamBytes) {
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

/**
 * Choose the largest context that comfortably fits in the RAM we actually have.
 *
 * The KV cache is the dominant variable cost: for SmolLM2 1.7B it is roughly 192 KB per
 * token of context (24 layers x 2048 kv-dim x 2 (K and V) x 2 bytes). At the default 4096
 * that alone is ~768 MB on top of ~1060 MB of weights, which does not fit in a 2 GB box.
 * Rather than hardcode a number that is wrong on small machines and stingy on big ones,
 * measure what is available and pick accordingly.
 */
async function pickContextSize(model) {
    const maxContextSize = Math.min(ACTIVE_MODEL.contextSize, model.trainContextSize);

    const requested = process.env.VOXELCHAT_CONTEXT_SIZE;
    if (requested != null) {
        const parsed = Number(requested);
        if (!Number.isFinite(parsed) || parsed < 256) {
            console.warn(`  Ignoring invalid VOXELCHAT_CONTEXT_SIZE="${requested}" (expected a number >= 256).`);
        } else {
            const chosen = Math.min(Math.floor(parsed), maxContextSize);
            if (chosen !== parsed) console.warn(`  Context capped at ${chosen} tokens (the model's trained window).`);
            return chosen;
        }
    }

    const estimateContextBytes = await createContextEstimator(model);
    if (estimateContextBytes == null) {
        const fallback = Math.min(2048, maxContextSize);
        console.log(`  Could not estimate memory use; starting with a ${fallback}-token context.`);
        return fallback;
    }

    const {contextSize, reason} = chooseContextSize({
        freeRamBytes: os.freemem() * RAM_SAFETY_FACTOR,
        weightsBytes: model.size,
        maxContextSize,
        estimateContextBytes
    });

    console.log(`  Using a ${contextSize}-token context window (${reason}).`);
    return contextSize;
}

/**
 * Returns a function mapping a context size to its estimated RAM cost, or null when the
 * estimation helpers are unavailable in the installed version.
 */
async function createContextEstimator(model) {
    let insights;
    try {
        insights = await GgufInsights.from(model.fileInfo, model.llama);
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
                modelGpuLayers: model.gpuLayers ?? 0
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

async function resolveModelPath() {
    if (MODEL_PATH_OVERRIDE != null) {
        if (!fs.existsSync(MODEL_PATH_OVERRIDE))
            throw new Error(`VOXELCHAT_MODEL_PATH points to a missing file: ${MODEL_PATH_OVERRIDE}`);

        update({phase: "loading", message: "Using the local model file from VOXELCHAT_MODEL_PATH…"});
        return MODEL_PATH_OVERRIDE;
    }

    const existingPath = path.join(MODELS_DIR, ACTIVE_MODEL.fileName);

    if (fs.existsSync(existingPath)) {
        update({phase: "loading", message: "Found the model on disk. Loading…"});
        return existingPath;
    }

    fs.mkdirSync(MODELS_DIR, {recursive: true});
    update({
        phase: "downloading",
        message: `Downloading ${ACTIVE_MODEL.name} (${ACTIVE_MODEL.approxSize}). This happens only once.`,
        downloadedBytes: 0,
        totalBytes: 0
    });

    return await resolveModelFile(ACTIVE_MODEL.url, {
        directory: MODELS_DIR,
        fileName: ACTIVE_MODEL.fileName,
        cli: false,
        onProgress({downloadedSize, totalSize}) {
            // Throttle status updates so the SSE/status endpoint isn't flooded.
            const now = Date.now();
            if (now - lastProgressAt < 250 && downloadedSize !== totalSize) return;
            lastProgressAt = now;

            update({
                phase: "downloading",
                downloadedBytes: downloadedSize,
                totalBytes: totalSize
            });
        }
    });
}

/**
 * Refuse to run a file that clearly isn't the catalogued model.
 *
 * Without this, pointing VOXELCHAT_MODEL_PATH at any small .gguf produces a model that
 * loads and generates happily but emits gibberish, which is very confusing to diagnose.
 */
function assertModelMatchesCatalog(model, modelPath) {
    const parameters = model.parametersCount ?? 0;
    const fileSize = model.size ?? 0;
    const expected = ACTIVE_MODEL.expectedParameters;
    const minBytes = ACTIVE_MODEL.minFileSizeBytes;

    if (fileSize > 0 && fileSize < minBytes) {
        throw new Error(
            `The file at "${modelPath}" is only ${(fileSize / 1048576).toFixed(1)} MB, but ` +
            `${ACTIVE_MODEL.name} should be about ${ACTIVE_MODEL.approxSize}. This is a different model — ` +
            `it would load but produce nonsense output. Delete it or point VOXELCHAT_MODEL_PATH at the real file.`
        );
    }

    // parametersCount is only available for some builds; skip the check when it is 0.
    if (parameters > 0 && expected > 0 && Math.abs(parameters - expected) / expected > 0.5) {
        throw new Error(
            `The file at "${modelPath}" has ${(parameters / 1e9).toFixed(2)}B parameters, but ` +
            `${ACTIVE_MODEL.name} has roughly ${(expected / 1e9).toFixed(1)}B. This is a different model — ` +
            `delete it or point VOXELCHAT_MODEL_PATH at the real file.`
        );
    }
}

function describeDevice(llama) {
    try {
        return llama.gpu === false ? "CPU" : String(llama.gpu ?? "CPU").toUpperCase();
    } catch {
        return "CPU";
    }
}

/** Release everything. Used on shutdown so the process exits promptly. */
export async function disposeModel() {
    try {
        await contextRef?.dispose();
        await modelRef?.dispose();
    } catch {
        // Nothing actionable during shutdown.
    }

    contextRef = null;
    modelRef = null;
    llamaRef = null;
    readyPromise = null;
}
