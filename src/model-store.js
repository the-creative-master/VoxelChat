/**
 * VoxelChat model store.
 *
 * VoxelChat ships with its model already inside the app. The GGUFs live in the
 * `models/` folder that travels with the application bundle, so the store only
 * ever *looks* at what is already on disk – it never reaches for the network
 * while the app is running.
 *
 * The one and only way a model gets into the store is
 * `npm run prepare-model`, which is a build-time step for developers and CI.
 * End users never run it: the model is part of the download.
 */
import {createHash} from "node:crypto";
import {createReadStream, existsSync, statSync} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * The models VoxelChat can ship with.
 *
 * `bundled: true` means the weights travel inside the application – there is
 * nothing to download and nothing to configure.
 */
export const MODEL_CATALOG = [
    {
        id: "smollm2-1.7b-instruct-q4_k_m",
        label: "SmolLM2 1.7B Instruct",
        shortLabel: "SmolLM2 1.7B",
        params: "1.7B",
        quant: "Q4_K_M",
        fileName: "smollm2-1.7b-instruct-q4_k_m.gguf",
        approxBytes: 1_055_609_536,
        contextLength: 8192,
        recommended: true,
        bundled: true,
        sha256: "decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33",
    },
    {
        id: "smollm2-360m-instruct-q8_0",
        label: "SmolLM2 360M Instruct",
        shortLabel: "SmolLM2 360M",
        params: "360M",
        quant: "Q8_0",
        fileName: "smollm2-360m-instruct-q8_0.gguf",
        approxBytes: 386_000_000,
        contextLength: 8192,
        recommended: false,
        bundled: false,
        sha256: null,
    },
    {
        id: "smollm2-135m-instruct-q4_k_s",
        label: "SmolLM2 135M Instruct",
        shortLabel: "SmolLM2 135M",
        params: "135M",
        quant: "Q4_K_S",
        fileName: "smollm2-135m-instruct-q4_k_s.gguf",
        approxBytes: 102_000_000,
        contextLength: 8192,
        recommended: false,
        bundled: false,
        sha256: null,
    },
];

const GGUF_MAGIC = "GGUF";

/** Human friendly byte formatting. */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));

    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export async function sha256OfFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        const stream = createReadStream(filePath);

        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

export async function looksLikeGguf(filePath) {
    const handle = await fs.open(filePath, "r");

    try {
        const buffer = Buffer.alloc(4);
        await handle.read(buffer, 0, 4, 0);

        return buffer.toString("ascii") === GGUF_MAGIC;
    } finally {
        await handle.close();
    }
}

/**
 * Lists every GGUF file that lives in the model store.
 */
export async function listLocalModels(modelsDir) {
    let entries = [];

    try {
        entries = await fs.readdir(modelsDir, {withFileTypes: true});
    } catch {
        return [];
    }

    const models = [];

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".gguf")) continue;

        const fullPath = path.join(modelsDir, entry.name);
        const stats = await fs.stat(fullPath).catch(() => null);

        if (!stats) continue;

        const catalogEntry = MODEL_CATALOG.find((item) => item.fileName.toLowerCase() === entry.name.toLowerCase());
        const detectedParams = detectParams(entry.name);

        models.push({
            id: catalogEntry?.id ?? `local:${entry.name}`,
            fileName: entry.name,
            path: fullPath,
            sizeBytes: stats.size,
            label: catalogEntry?.label ?? prettifyName(entry.name),
            shortLabel: catalogEntry?.shortLabel ?? prettifyName(entry.name, true),
            params: catalogEntry?.params ?? detectedParams ?? "custom",
            quant: catalogEntry?.quant ?? detectQuant(entry.name) ?? "GGUF",
            contextLength: catalogEntry?.contextLength ?? 8192,
            recommended: catalogEntry?.recommended ?? false,
            bundled: catalogEntry?.bundled ?? false,
            known: Boolean(catalogEntry),
        });
    }

    return models.sort((a, b) => rankModel(b) - rankModel(a));
}

function detectParams(fileName) {
    const match = fileName.match(/(\d+(?:\.\d+)?)\s*([BM])/i);

    if (!match) return null;

    return `${match[1]}${match[2].toUpperCase()}`;
}

function detectQuant(fileName) {
    const match = fileName.match(/(q\d(?:_[A-Z]+)*|iq\d(?:_[a-z]+)*|f16|f32|bf16)/i);

    return match ? match[1].toUpperCase() : null;
}

function prettifyName(fileName, short = false) {
    const base = fileName
        .replace(/\.gguf$/i, "")
        .replace(/[._-]?(iq\d(?:_[a-z0-9]+)*|q\d(?:_[a-z0-9]+)*|f16|f32|bf16|fp16)$/i, "")
        .replace(/[-_.]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (short) return base;

    return base.replace(/\b\w/g, (character) => character.toUpperCase());
}

function rankModel(model) {
    const paramsValue = parseFloat(model.params ?? "0") || 0;

    return paramsValue * 1000 + model.sizeBytes / 1_000_000;
}

/**
 * Picks the model VoxelChat should run.
 *
 * Priority:
 *  1. A model the user explicitly selected.
 *  2. The bundled flagship model that is already cached on disk.
 *  3. The biggest SmolLM2 that is already cached on disk.
 */
export function chooseModel(localModels, preferredId) {
    if (preferredId) {
        const preferred = localModels.find((model) => model.id === preferredId || model.path === preferredId);

        if (preferred) return preferred;
    }

    const recommended = localModels.find((model) => model.recommended);

    if (recommended) return recommended;

    return localModels[0] ?? null;
}

/**
 * The flagship model, used for the "what should VoxelChat run?" messaging.
 */
export function flagshipModel() {
    return MODEL_CATALOG.find((model) => model.recommended) ?? MODEL_CATALOG[0];
}

/**
 * Checks a model file: it has to exist, to be a real GGUF and – when the
 * catalogue knows the checksum – to match it byte for byte.
 */
export async function verifyModelFile(filePath, catalogEntry) {
    const stats = await fs.stat(filePath).catch(() => null);

    if (!stats || stats.size < 1024) {
        return {ok: false, reason: "The model file is empty."};
    }

    if (!(await looksLikeGguf(filePath))) {
        return {ok: false, reason: "The model file is not a valid GGUF model."};
    }

    if (catalogEntry?.sha256) {
        const digest = await sha256OfFile(filePath);

        if (digest !== catalogEntry.sha256) {
            return {
                ok: false,
                reason: `Checksum mismatch (expected ${catalogEntry.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…).`,
            };
        }
    }

    return {ok: true, sizeBytes: stats.size};
}

/**
 * True when the file is already on disk and intact.
 */
export async function isModelCached(modelsDir, catalogEntry) {
    const targetPath = path.join(modelsDir, catalogEntry.fileName);

    if (!existsSync(targetPath)) return false;

    const stats = statSync(targetPath);

    if (stats.size < 1024) return false;

    return (await verifyModelFile(targetPath, catalogEntry)).ok;
}
