import fs from "node:fs";
import path from "node:path";
import {getLlama, resolveModelFile, LlamaLogLevel} from "node-llama-cpp";
import {ACTIVE_MODEL, MODELS_DIR, MODEL_PATH_OVERRIDE} from "./models.js";

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

    // Never request a context larger than the model was trained on.
    const contextSize = Math.min(ACTIVE_MODEL.contextSize, model.trainContextSize);

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
        totalBytes: status.totalBytes
    });

    return {llama, model, context};
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
