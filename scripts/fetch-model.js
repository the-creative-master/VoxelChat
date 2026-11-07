#!/usr/bin/env node
/**
 * Download the default model (or any catalogued model) into the cache.
 *
 *   npm run fetch
 *   npm run fetch -- smollm2-1.7b-instruct-q4_k_m
 *
 * This exists so nobody has to know a shell-specific download command: no curl flags,
 * no PowerShell aliases, no backslash line continuations. It runs anywhere Node runs.
 */
import {
    getDefaultModel,
    getModel,
    CACHE_DIR,
    cachePathFor,
    isCached,
    formatBytes
} from "../src/catalog.js";
import {fetchModelToCache} from "../src/cache.js";

const requestedId = process.argv[2];
const model = requestedId != null ? getModel(requestedId) : getDefaultModel();

if (model == null) {
    console.error(`\n  Unknown model "${requestedId}".\n  Run "npm run doctor" to see the catalog, or check config/models.json.\n`);
    process.exit(1);
}

if (isCached(model)) {
    console.log(`\n  ${model.name} is already cached.`);
    console.log(`  ${cachePathFor(model)}\n`);
    process.exit(0);
}

console.log("");
console.log(`  Caching ${model.name} (${model.approxSize ?? formatBytes(model.sizeBytes)})`);
console.log(`  into ${CACHE_DIR}`);
console.log("");

let lastLine = "";
try {
    await fetchModelToCache(model, {
        onProgress({downloadedBytes, totalBytes, verifying}) {
            if (verifying) {
                process.stdout.write(`\r  Verifying checksum…${" ".repeat(28)}`);
                return;
            }

            const pct = totalBytes > 0 ? Math.floor((downloadedBytes / totalBytes) * 100) : 0;
            const line = `  ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}  (${pct}%)`;
            if (line !== lastLine) {
                lastLine = line;
                process.stdout.write(`\r${line}${" ".repeat(8)}`);
            }
        }
    });

    process.stdout.write("\r" + " ".repeat(60) + "\r");
    console.log(`  Done. ${model.name} is cached.`);
    console.log(`  ${cachePathFor(model)}\n`);
    console.log("  Start the app with: npm start\n");
} catch (error) {
    process.stdout.write("\r" + " ".repeat(60) + "\r");
    console.error(`\n  Download failed: ${error?.message ?? error}\n`);
    console.error("  If your network blocks Hugging Face, download the file in a browser");
    console.error("  and save it to:");
    console.error(`    ${cachePathFor(model)}`);
    console.error(`\n  Direct link:\n    ${model.url}\n`);
    process.exit(1);
}
