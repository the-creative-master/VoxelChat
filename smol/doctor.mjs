// Doctor: checks every layer of Smol and prints what's broken.
//   node smol/doctor.mjs [model-uri-or-path]
//
// Verifies Node, node-llama.cpp's native binary, the GGUF tokenizer, context
// creation, and one streamed completion. Exit code 0 = healthy.

import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelArg = process.argv[2];

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const head = (m) => console.log(`\n${m}`);

let failures = 0;
const fail = (m) => {
  failures++;
  bad(m);
};

head("1. runtime");
const major = Number(process.versions.node.split(".")[0]);
major >= 22 ? ok(`node ${process.version}`) : fail(`node ${process.version} — need >= 22`);
console.log(`  · ${process.platform}/${process.arch}, ${await cpuCores()} cores`);

head("2. node-llama-cpp");
let lib;
try {
  lib = await import("node-llama-cpp");
  ok("package importable");
} catch (err) {
  fail(`cannot import node-llama-cpp: ${err?.message || err}`);
  console.log("\n  → run `npm i` in the project root");
  process.exit(1);
}

let llama;
try {
  llama = await lib.getLlama({ logLevel: "error" });
  ok(`native llama.cpp loaded (backend: ${llama.gpu === false ? "cpu" : llama.gpu})`);
} catch (err) {
  fail(`native binary failed to start: ${err?.message || err}`);
  console.log(
    "\n  → the prebuilt binary didn't load. Try:\n" +
      "      npm rebuild node-llama-cpp\n" +
      "      npx --no node-llama-cpp source download --gpu false\n"
  );
  process.exit(1);
}

head("3. model");
const uri =
  modelArg ||
  process.env.SMOL_MODEL ||
  "hf:bartowski/SmolLM2-1.7B-Instruct-GGUF:Q4_K_M";
console.log(`  · ${uri}`);
let modelPath;
try {
  // Local paths are used as-is; only hf:/https: URIs get downloaded.
  const candidates = [
    uri,
    path.resolve(process.cwd(), uri),
    path.join(__dirname, "..", "models", path.basename(uri)),
  ];
  const local = /^(hf|https?):/i.test(uri)
    ? null
    : candidates.find((p) => p.endsWith(".gguf") && existsSync(p));
  modelPath = await lib.resolveModelFile(local ? path.resolve(local) : uri, {
    directory: path.join(__dirname, "..", "models"),
    cli: true,
  });
  ok(`model file: ${modelPath}`);
} catch (err) {
  fail(`could not resolve/download model: ${err?.message || err}`);
  console.log(
    "\n  → if this is a network/TLS failure, download the GGUF manually and pass its path:\n" +
      "      node smol/doctor.mjs /path/to/SmolLM2-1.7B-Instruct-Q4_K_M.gguf\n"
  );
  process.exit(1);
}

let model;
try {
  model = await llama.loadModel({ modelPath, gpuLayers: "auto" });
  ok("weights loaded");
} catch (err) {
  fail(`llama.cpp rejected the file: ${err?.message || err}`);
  process.exit(1);
}

// node-llama-cpp nests metadata under `general`; fall back to flat lookups.
const md = model.fileInfo.metadata;
const meta = md?.general ?? md ?? {};
const arch = meta.architecture ?? meta["general.architecture"] ?? model.fileInfo.architecture;
const name = meta.name ?? meta["general.name"] ?? "(unnamed)";
ok(`architecture: ${arch ?? "?"}, name: ${name}, ctx: ${model.trainContextSize}, ${model.fileInfo.metadata?.tokenizer ? "tokenizer present" : "no tokenizer metadata"}`);
if (arch && !String(arch).includes("smollm") && !String(name).toLowerCase().includes("smollm")) {
  warn("this is not a SmolLM2 file — generation will work but it isn't the intended model");
}

head("4. tokenizer");
const probe = "Hello, how are you today?";
const tokens = model.tokenize(probe);
if (tokens.length === 0) {
  fail("tokenizer produced zero tokens — this GGUF has no usable vocabulary");
  console.log("  → a vocab-only/embedding GGUF can't chat. Use a full *instruct* GGUF.");
  process.exit(1);
}
const roundTrip = model.detokenize(tokens);
ok(`tokenizes text (${tokens.length} tokens for "${probe}")`);
if (roundTrip.trim() !== probe.trim()) {
  warn(`detokenized text differs: "${roundTrip.slice(0, 60)}"`);
}

head("5. inference");
try {
  const start = Date.now();
  const ctx = await model.createContext({ contextSize: 512 });
  const session = new lib.LlamaChatSession({
    contextSequence: ctx.getSequence(),
    chatWrapper: new lib.ChatMLChatWrapper(),
    systemPrompt: "You are Smol.",
  });
  let chunks = 0;
  let text = "";
  const res = await session.promptWithMeta("Say hello in five words.", {
    maxTokens: 24,
    temperature: 0.7,
    onTextChunk: (c) => {
      chunks++;
      text += c;
    },
  });
  const ms = Date.now() - start;
  ok(`generated ${chunks} chunks in ${ms} ms (${res.stopReason})`);
  console.log(`\n  reply: ${JSON.stringify((text || res.responseText).slice(0, 200))}\n`);
  await ctx.dispose();
} catch (err) {
  fail(`generation failed: ${err?.message || err}`);
}

await model.dispose();
head(failures === 0 ? "\x1b[32mAll checks passed — `npm start` should work.\x1b[0m" : `\x1b[31m${failures} check(s) failed.\x1b[0m`);
process.exit(failures === 0 ? 0 : 1);

async function cpuCores() {
  const os = await import("node:os");
  return os.default.cpus().length;
}
