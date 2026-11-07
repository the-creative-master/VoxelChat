#!/usr/bin/env node
/**
 * Remove generated directories. Works identically on Windows, macOS and Linux, so nobody
 * has to remember that `rm -rf` is bash-only (and that PowerShell's `rm -rf` alias behaves
 * subtly differently).
 *
 *   npm run clean            removes node_modules
 *   npm run clean -- --cache removes node_modules and the model cache
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const includeCache = args.includes("--cache") || args.includes("--all");

const targets = [
    {dir: "node_modules", label: "installed packages"},
    {dir: "cache", label: "cached models", optional: true}
];

console.log("");

let removed = 0;
for (const {dir, label, optional} of targets) {
    if (optional && !includeCache) {
        console.log(`  Keeping ${dir}/ (${label}). Run with --cache to remove it too.`);
        continue;
    }

    const target = path.join(ROOT, dir);

    if (!fs.existsSync(target)) {
        console.log(`  ${dir}/ is already gone.`);
        continue;
    }

    try {
        fs.rmSync(target, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
        console.log(`  Removed ${dir}/ (${label}).`);
        removed += 1;
    } catch (error) {
        console.error(`  Could not remove ${dir}/: ${error.message}`);
        console.error("  Close any program using it (editors, terminals, running servers) and retry.");
        process.exitCode = 1;
    }
}

console.log("");
if (removed > 0) console.log("  Run `npm install` to reinstall.\n");
