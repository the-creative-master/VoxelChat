/**
 * Pre-cache the SmolLM2 model into `models/`.
 *
 * VoxelChat does this by itself on the first launch – this script is only here
 * for people who want to warm the cache up front (or in CI).
 *
 *   npm run prepare-model
 */
import path from "node:path";
import {fileURLToPath} from "node:url";

import {downloadCatalogModel, formatBytes, listLocalModels, MODEL_CATALOG} from "../src/model-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.resolve(here, "..", "models");

const target = MODEL_CATALOG.find((model) => model.recommended) ?? MODEL_CATALOG[0];
const cached = await listLocalModels(modelsDir);

if (cached.some((model) => model.id === target.id)) {
    console.log(`✔ ${target.label} is already cached in ${modelsDir}`);
    process.exit(0);
}

console.log(`↓ Fetching ${target.label} (${formatBytes(target.approxBytes)})…`);

const startedAt = Date.now();
let lastLine = "";

await downloadCatalogModel(target, {
    modelsDir,
    log: (message) => console.log(`  ${message}`),
    onProgress: ({downloadedBytes, totalBytes, ratio}) => {
        const line = `  ${Math.round(ratio * 100)}% · ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;

        if (line !== lastLine) {
            process.stdout.write(`\r${line}`);
            lastLine = line;
        }
    },
});

process.stdout.write("\r");
console.log(`✔ ${target.label} is ready in ${modelsDir} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
process.exit(0);
