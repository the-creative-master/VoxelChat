/**
 * VoxelChat model store.
 *
 * VoxelChat keeps every GGUF it uses inside a single folder (`models/`).
 * The store knows which models VoxelChat can run, which ones are already on
 * disk ("pre-cached"), and how to fetch a missing one without ever asking the
 * user to run a command.
 */
import {createHash} from "node:crypto";
import {createReadStream, createWriteStream, existsSync, statSync} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";

/** Official SmolLM2 GGUF releases (Apache-2.0). */
export const MODEL_CATALOG = [
    {
        id: "smollm2-1.7b-instruct-q4_k_m",
        label: "SmolLM2 1.7B Instruct",
        shortLabel: "SmolLM2 1.7B",
        params: "1.7B",
        quant: "Q4_K_M",
        fileName: "smollm2-1.7b-instruct-q4_k_m.gguf",
        approxBytes: 1_100_000_000,
        contextLength: 8192,
        recommended: true,
        sha256: "decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33",
        mirrors: [
            "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/2d4a76a30b4af41ecd395c35725ac11688d4cfe4/smollm2-1.7b-instruct-q4_k_m.gguf",
            "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf",
            "https://hf-mirror.com/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf",
        ],
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
        sha256: null,
        mirrors: [
            "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf",
            "https://hf-mirror.com/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf",
        ],
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
        sha256: null,
        mirrors: [
            "https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q4_k_s.gguf",
            "https://hf-mirror.com/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q4_k_s.gguf",
        ],
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

async function sha256OfFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        const stream = createReadStream(filePath);

        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

async function looksLikeGguf(filePath) {
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
 *  2. The biggest SmolLM2 that is already cached on disk (the "pre-cached" path).
 *  3. The recommended catalog model (which the caller then downloads automatically).
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
 * Downloads a catalog model into the store. Fully automatic: mirrors are tried
 * in order, partial downloads resume, and the file is only promoted to its
 * final name once it is complete and verified.
 */
export async function downloadCatalogModel(catalogEntry, {modelsDir, onProgress, signal, log = () => {}}) {
    const targetPath = path.join(modelsDir, catalogEntry.fileName);
    const partialPath = `${targetPath}.part`;

    if (existsSync(targetPath)) {
        const stats = statSync(targetPath);

        if (stats.size > 0) return targetPath;
    }

    await fs.mkdir(modelsDir, {recursive: true});

    let lastError = null;

    for (const [index, url] of catalogEntry.mirrors.entries()) {
        const attempt = index + 1;

        try {
            log(`Fetching ${catalogEntry.fileName} (mirror ${attempt}/${catalogEntry.mirrors.length})`);

            const resumeFrom = existsSync(partialPath) ? statSync(partialPath).size : 0;
            const response = await fetch(url, {
                headers: resumeFrom > 0 ? {Range: `bytes=${resumeFrom}-`} : {},
                redirect: "follow",
                signal,
            });

            if (response.status === 416) {
                // The partial file already covers the whole model.
            } else if (!response.ok && response.status !== 206) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const remaining = Number(response.headers.get("content-length") ?? 0);
            const totalBytes = remaining > 0 ? remaining + resumeFrom : catalogEntry.approxBytes;
            let downloaded = resumeFrom;
            let lastReport = 0;

            const source = Readable.fromWeb(response.body);
            const meter = new Transform({
                transform(chunk, _encoding, callback) {
                    downloaded += chunk.length;

                    const now = Date.now();

                    if (now - lastReport >= 250) {
                        lastReport = now;
                        onProgress?.({
                            downloadedBytes: downloaded,
                            totalBytes,
                            ratio: totalBytes > 0 ? Math.min(1, downloaded / totalBytes) : 0,
                        });
                    }

                    callback(null, chunk);
                },
            });

            await pipeline(source, meter, createWriteStream(partialPath, {flags: resumeFrom > 0 ? "a" : "w"}));

            onProgress?.({downloadedBytes: downloaded, totalBytes, ratio: 1});

            const verified = await verifyDownload(partialPath, catalogEntry);

            if (!verified.ok) {
                await fs.rm(partialPath, {force: true});
                throw new Error(verified.reason ?? "Downloaded file failed verification");
            }

            await fs.rename(partialPath, targetPath);

            return targetPath;
        } catch (error) {
            if (signal?.aborted) throw error;

            lastError = error;
            log(`Mirror failed: ${error.message}`);
        }
    }

    throw lastError ?? new Error("Could not download the model");
}

async function verifyDownload(filePath, catalogEntry) {
    const stats = await fs.stat(filePath).catch(() => null);

    if (!stats || stats.size < 1024) {
        return {ok: false, reason: "The downloaded file is empty."};
    }

    if (!(await looksLikeGguf(filePath))) {
        return {ok: false, reason: "The downloaded file is not a valid GGUF model."};
    }

    if (catalogEntry.sha256) {
        const digest = await sha256OfFile(filePath);

        if (digest !== catalogEntry.sha256) {
            return {ok: false, reason: `Checksum mismatch (expected ${catalogEntry.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…).`};
        }
    }

    return {ok: true};
}
