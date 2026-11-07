import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG_FILE = path.join(ROOT_DIR, "config", "models.json");

/**
 * Model cache directory. This holds the GGUF files only — it is disposable and rebuilding
 * it means re-downloading, which is exactly why it lives outside version control.
 */
export const CACHE_DIR = process.env.VOXELCHAT_CACHE_DIR
    || path.join(ROOT_DIR, "cache", "models");

/** Legacy location, still read so an existing download is not thrown away. */
export const LEGACY_MODELS_DIR = path.join(ROOT_DIR, "models");

/** Point at one specific local .gguf to use it instead of the default model. */
export const MODEL_PATH_OVERRIDE = process.env.VOXELCHAT_MODEL_PATH || null;

function readConfig() {
    let raw;
    try {
        raw = fs.readFileSync(CONFIG_FILE, "utf8");
    } catch {
        throw new Error(`Cannot read the model catalog at ${CONFIG_FILE}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`The model catalog is not valid JSON: ${error.message}`);
    }

    const models = Array.isArray(parsed.models) ? parsed.models : [];
    if (models.length === 0) throw new Error("The model catalog is empty.");

    for (const model of models) {
        for (const field of ["id", "name", "url", "contextSize"]) {
            if (model[field] == null) throw new Error(`Model "${model.id ?? "?"}" is missing "${field}".`);
        }
    }

    return {defaultModelId: parsed.defaultModelId ?? models[0].id, models};
}

const {defaultModelId, models} = readConfig();

/** The model that is used when nothing else is selected. No download is needed for it. */
export const DEFAULT_MODEL_ID = defaultModelId;

export const MODELS = models.map(model => ({
    ...model,
    fileName: model.fileName ?? path.basename(new URL(model.url).pathname)
}));

export function getModel(id) {
    return MODELS.find(model => model.id === id) ?? null;
}

export function getDefaultModel() {
    return getModel(DEFAULT_MODEL_ID) ?? MODELS[0];
}

/** Where a model's file lives inside the cache. */
export function cachePathFor(model) {
    if (MODEL_PATH_OVERRIDE != null && model.id === getDefaultModel().id) return MODEL_PATH_OVERRIDE;
    return path.join(CACHE_DIR, model.fileName);
}

/** Is this model already cached and plausibly intact? */
export function isCached(model) {
    const file = cachePathFor(model);

    let stat;
    try {
        stat = fs.statSync(file);
    } catch {
        // Fall back to the pre-rename "models/" directory so old downloads still count.
        const legacy = path.join(LEGACY_MODELS_DIR, model.fileName);
        try {
            const legacyStat = fs.statSync(legacy);
            return legacyStat.size >= (model.minValidBytes ?? 0);
        } catch {
            return false;
        }
    }

    return stat.isFile() && stat.size >= (model.minValidBytes ?? 0);
}

/** Metadata safe to send to the browser. */
export function toPublicModel(model, extra = {}) {
    return {
        id: model.id,
        name: model.name,
        family: model.family ?? null,
        parameters: model.parameters ?? null,
        quantization: model.quantization ?? null,
        sizeBytes: model.sizeBytes ?? null,
        approxSize: formatBytes(model.sizeBytes),
        contextSize: model.contextSize,
        description: model.description ?? "",
        cached: isCached(model),
        isDefault: model.id === DEFAULT_MODEL_ID,
        ...extra
    };
}

export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "unknown";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value < 10 && unit > 1 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
