#!/usr/bin/env node
/**
 * Verifies that the bundled model is intact and that it actually answers.
 *
 *   npm run verify-model
 */
import path from "node:path";
import {fileURLToPath} from "node:url";

import {getLlama, LlamaChatSession} from "node-llama-cpp";

import {flagshipModel, listLocalModels, verifyModelFile} from "../src/model-store.js";
import {resolveThreadCount} from "../src/engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.resolve(here, "..", "models");

const flagship = flagshipModel();
const local = await listLocalModels(modelsDir);
const target = local.find((model) => model.id === flagship.id) ?? local[0];

if (!target) {
    console.error(`✖ No model found in ${modelsDir}. Run "npm run prepare-model" first.`);

    process.exit(1);
}

const verified = await verifyModelFile(target.path, flagship.id === target.id ? flagship : null);

if (!verified.ok) {
    console.error(`✖ ${target.fileName}: ${verified.reason}`);

    process.exit(1);
}

console.log(`✔ ${target.label} (${target.quant}, ${(target.sizeBytes / 1e9).toFixed(2)} GB) – checksum OK`);

const llama = await getLlama({gpu: "auto", logLevel: "error"});

console.log(`  device: ${llama.gpu === false ? "CPU" : llama.gpu}, threads: ${resolveThreadCount()}`);

const model = await llama.loadModel({modelPath: target.path});
const context = await model.createContext({contextSize: 2048, threads: resolveThreadCount()});
const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: "You are a helpful assistant.",
});

const started = Date.now();
let reply = "";
let tokens = 0;

await session.prompt("In one sentence, what is SmolLM2?", {
    maxTokens: 120,
    onToken: (chunk) => {
        tokens += chunk?.length ?? 0;
    },
    onTextChunk: (chunk) => {
        reply += chunk;
    },
});

const elapsed = Date.now() - started;

console.log("  reply:");
console.log(`    ${reply.trim().replace(/\n/g, "\n    ")}`);
console.log(`  ${tokens} tokens in ${(elapsed / 1000).toFixed(1)}s (${((tokens / elapsed) * 1000).toFixed(1)} tok/s)`);

await context.dispose();
await model.dispose();
await llama.dispose();

console.log("\n✔ Model verified.");
