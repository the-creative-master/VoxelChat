#!/usr/bin/env node
/**
 * Environment diagnostics for VoxelChat install problems.
 *
 * Run with: npm run doctor
 *
 * This only reads the environment; it never modifies anything, so it is safe to run at
 * any point, including before `npm install` has succeeded.
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const results = [];

function record(name, ok, detail, hint) {
    results.push({name, ok, detail, hint});
}

function section(title) {
    console.log(`\n${title}`);
    console.log("─".repeat(title.length));
}

function tryExec(command, args) {
    try {
        return execFileSync(command, args, {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
    } catch {
        return null;
    }
}

/* --------------------------------- runtime -------------------------------- */

section("Runtime");

const nodeVersion = process.versions.node;
const major = Number(nodeVersion.split(".")[0]);

record(
    "Node.js version",
    major >= 20,
    `v${nodeVersion}`,
    major >= 20 ? null : "VoxelChat requires Node.js 20 or newer. Install it from https://nodejs.org and re-run npm install."
);

record(
    "Platform",
    true,
    `${process.platform} ${process.arch}`,
    null
);

const npmVersion = tryExec(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"]);
record("npm version", npmVersion != null, npmVersion ?? "not found", npmVersion == null ? "npm is not on your PATH." : null);

const totalRamGb = os.totalmem() / 1024 ** 3;
const freeRamGb = os.freemem() / 1024 ** 3;
record(
    "Memory",
    totalRamGb >= 1.8,
    `${freeRamGb.toFixed(1)} GB free of ${totalRamGb.toFixed(1)} GB`,
    totalRamGb >= 1.8 ? null : "SmolLM2 1.7B needs roughly 1.2 GB of RAM. Use a smaller quant."
);

/* ------------------------------- install state ---------------------------- */

section("Install state");

const nodeModules = path.join(ROOT, "node_modules");
const llamaPkg = path.join(nodeModules, "node-llama-cpp", "package.json");
const expressPkg = path.join(nodeModules, "express", "package.json");

record("node_modules/ exists", fs.existsSync(nodeModules), nodeModules, fs.existsSync(nodeModules) ? null : "Run npm install.");

let llamaVersion = null;
if (fs.existsSync(llamaPkg)) {
    try {
        llamaVersion = JSON.parse(fs.readFileSync(llamaPkg, "utf8")).version;
    } catch {
        llamaVersion = "unreadable";
    }
}
record("node-llama-cpp installed", llamaVersion != null, llamaVersion ?? "missing", llamaVersion == null ? "Run npm install." : null);
record("express installed", fs.existsSync(expressPkg), fs.existsSync(expressPkg) ? "present" : "missing", fs.existsSync(expressPkg) ? null : "Run npm install.");

// Does a prebuilt binary exist for this platform?
const platformPkg = (() => {
    const {platform, arch} = process;
    if (platform === "darwin") return `mac-${arch === "arm64" ? "arm64" : "x64"}`;
    if (platform === "win32") return `win-${arch === "arm64" ? "arm64" : "x64"}`;
    if (platform === "linux") {
        if (arch === "arm64") return "linux-arm64";
        if (arch === "arm") return "linux-armv7l";
        if (arch === "riscv64") return "linux-riscv64";
        return "linux-x64";
    }
    return null;
})();

if (platformPkg != null) {
    const binDir = path.join(nodeModules, "@node-llama-cpp", platformPkg, "bins");
    const hasBinary = fs.existsSync(binDir);
    record(
        `Prebuilt binary for ${platformPkg}`,
        hasBinary,
        hasBinary ? "present" : "not downloaded",
        hasBinary ? null : `llama.cpp will be built from source, which needs cmake and a C++ toolchain.\n    You can also fetch it manually: npx --no-install node-llama-cpp source download`
    );
}

/* --------------------------------- network -------------------------------- */

section("Network");

// npm registry reachability via a lightweight HEAD on the registry root.
async function checkRegistry() {
    try {
        const res = await fetch("https://registry.npmjs.org/-/ping", {signal: AbortSignal.timeout(6000)});
        return res.ok;
    } catch {
        return false;
    }
}

const registryOk = await checkRegistry();
record(
    "npm registry reachable",
    registryOk,
    registryOk ? "ok" : "unreachable",
    registryOk ? null : "A proxy or firewall is blocking registry.npmjs.org."
);

async function checkHost(url, label, hint) {
    try {
        const res = await fetch(url, {method: "HEAD", signal: AbortSignal.timeout(6000)});
        record(`${label} reachable`, res.ok, res.ok ? "ok" : `HTTP ${res.status}`, res.ok ? null : hint);
    } catch {
        record(`${label} reachable`, false, "unreachable", hint);
    }
}

await checkHost("https://huggingface.co", "Hugging Face", "The download will fail. Try `npm run fetch`, or save the .gguf into the cache dir yourself.");

/* --------------------------------- models --------------------------------- */

section("Model");

const cacheDir = process.env.VOXELCHAT_CACHE_DIR || path.join(ROOT, "cache", "models");
const fromEnv = process.env.VOXELCHAT_MODEL_PATH;

if (fromEnv != null) {
    const exists = fs.existsSync(fromEnv);
    const sizeMb = exists ? fs.statSync(fromEnv).size / 1024 ** 2 : 0;
    record("VOXELCHAT_MODEL_PATH override", exists && sizeMb > 300, `${fromEnv} (${sizeMb.toFixed(0)} MB)`, exists ? null : "That file does not exist.");
}

if (fs.existsSync(cacheDir)) {
    const files = fs.readdirSync(cacheDir).filter(name => name.endsWith(".gguf") || name.endsWith(".partial"));
    const gguf = files.filter(name => name.endsWith(".gguf"));
    const partial = files.filter(name => name.endsWith(".partial"));
    const sizeMb = gguf.reduce((sum, name) => sum + fs.statSync(path.join(cacheDir, name)).size / 1024 ** 2, 0);

    record("Model cache", gguf.length > 0, gguf.length > 0 ? `${gguf.join(", ")} (${sizeMb.toFixed(0)} MB)` : "empty", gguf.length > 0 ? null : "The default model is cached once on first run, or now with: npm run fetch");

    record("No half-finished downloads", partial.length === 0, partial.length === 0 ? "none" : `${partial.join(", ")}`, partial.length === 0 ? null : "A partial download was interrupted; it will be retried automatically.");
} else {
    record("Model cache", false, `${cacheDir} does not exist yet`, "It is created on first run.");
}

/* --------------------------------- report --------------------------------- */

section("Summary");

let problems = 0;
for (const {name, ok, detail, hint} of results) {
    console.log(`  ${ok ? "OK  " : "WARN"}  ${name}: ${detail}`);
    if (!ok) {
        problems += 1;
        if (hint != null) console.log(`        → ${hint}`);
    }
}

console.log("");
if (problems === 0) {
    console.log("Everything checks out. Run: npm start");
} else {
    console.log(`${problems} item(s) need attention — see the notes above.`);
}

// Diagnostics should never fail the shell.
process.exit(0);
