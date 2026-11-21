/**
 * Pre-cache the SmolLM2 model into `models/`.
 *
 * This is a *build-time* helper for developers and CI – end users never run
 * it. The model travels inside the VoxelChat app bundle; this script only
 * exists so that a fresh checkout (or the release pipeline) can put the
 * weights in place before the app is packaged.
 *
 *   npm run prepare-model
 *
 * The weights come from VoxelChat's own GitHub release – the same place the
 * packaged app gets them from – so nothing in this project depends on
 * Hugging Face at runtime. Pass `--allow-huggingface` to additionally fall
 * back to the upstream repository while building.
 */
import {createWriteStream, existsSync, statSync} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {fileURLToPath} from "node:url";

import {formatBytes, flagshipModel, isModelCached, verifyModelFile} from "../src/model-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.resolve(here, "..", "models");

const target = flagshipModel();
const allowHuggingFace = process.argv.includes("--allow-huggingface");

const sources = [
    {
        label: "the VoxelChat release",
        url: `https://github.com/the-creative-master/VoxelChat/releases/download/smollm2-1.7b-instruct-q4_k_m/${target.fileName}`,
    },
];

if (allowHuggingFace) {
    sources.push({
        label: "the upstream repository",
        url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/2d4a76a30b4af41ecd395c35725ac11688d4cfe4/smollm2-1.7b-instruct-q4_k_m.gguf",
    });
}

if (await isModelCached(modelsDir, target)) {
    console.log(`✔ ${target.label} is already cached in ${modelsDir}`);

    process.exit(0);
}

await fs.mkdir(modelsDir, {recursive: true});

const targetPath = path.join(modelsDir, target.fileName);
const partialPath = `${targetPath}.part`;
const startedAt = Date.now();
let lastError = null;
let lastLine = "";

for (const source of sources) {
    try {
        console.log(`↓ Fetching ${target.label} from ${source.label}…`);

        const resumeFrom = existsSync(partialPath) ? statSync(partialPath).size : 0;
        const response = await fetch(source.url, {
            headers: resumeFrom > 0 ? {Range: `bytes=${resumeFrom}-`} : {},
            redirect: "follow",
        });

        if (!response.ok && response.status !== 206) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const remaining = Number(response.headers.get("content-length") ?? 0);
        const totalBytes = remaining > 0 ? remaining + resumeFrom : target.approxBytes;
        let downloaded = resumeFrom;
        let lastReport = 0;

        const meter = new Transform({
            transform(chunk, _encoding, callback) {
                downloaded += chunk.length;

                const now = Date.now();

                if (now - lastReport >= 250) {
                    lastReport = now;

                    const line = `  ${Math.round((downloaded / totalBytes) * 100)}% · ${formatBytes(downloaded)} / ${formatBytes(totalBytes)}`;

                    if (line !== lastLine) {
                        process.stdout.write(`\r${line}`);
                        lastLine = line;
                    }
                }

                callback(null, chunk);
            },
        });

        await pipeline(
            Readable.fromWeb(response.body),
            meter,
            createWriteStream(partialPath, {flags: resumeFrom > 0 ? "a" : "w"}),
        );

        process.stdout.write("\r");

        const verified = await verifyModelFile(partialPath, target);

        if (!verified.ok) {
            await fs.rm(partialPath, {force: true});
            throw new Error(verified.reason ?? "The downloaded file failed verification.");
        }

        await fs.rename(partialPath, targetPath);

        console.log(`✔ ${target.label} is ready in ${modelsDir} (${Math.round((Date.now() - startedAt) / 1000)}s)`);

        process.exit(0);
    } catch (error) {
        lastError = error;
        console.log(`  ${error.message}`);
    }
}

console.error(`✖ Could not prepare ${target.label}: ${lastError?.message ?? "unknown error"}`);
process.exit(1);
