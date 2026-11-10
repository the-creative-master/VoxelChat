// VoxelChat server — a local AI chat powered by node-llama.cpp.
//
// • No API keys, no cloud, no accounts. Everything runs on this machine.
// • NO downloading at runtime: the model (SmolLM2 1.7B Instruct, Q4_K_M)
//   is CACHED in ./models and loaded straight from disk. The cache is
//   populated once by `npm run cache-model` (also run in CI) — after
//   that VoxelChat never touches the network.
// • Only dependency: node-llama-cpp (auto-installed by `npm start`).
import http from "node:http";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const MODELS_DIR = path.join(ROOT, "models");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

// SmolLM2 1.7B Instruct (Q4_K_M, ~1.1 GB) — cached locally, never downloaded at runtime.
export const CACHED_MODEL_FILE = "smollm2-1.7b-instruct-q4_k_m.gguf";
const MODEL_NAME = process.env.MODEL_NAME || "SmolLM2 1.7B (cached)";
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are VoxelChat, a friendly and helpful AI assistant running fully offline on the user's own computer. " +
    "Answer clearly and concisely. Use Markdown when it helps (lists, code blocks). If you don't know something, say so.";

// ---------------------------------------------------------------- state
const state = {
  phase: "starting", // starting | loading | ready | missing | error
  modelName: MODEL_NAME,
  cached: false,
  error: null,
};

let llama = null;
let model = null;
let context = null;
let chatChain = Promise.resolve(); // serialize generations (one local model)

function localModelFile() {
  // 1) explicit override, 2) the cached SmolLM2 1.7B, 3) any other cached .gguf.
  if (process.env.MODEL_PATH && existsSync(process.env.MODEL_PATH)) return process.env.MODEL_PATH;
  const cached = path.join(MODELS_DIR, CACHED_MODEL_FILE);
  if (existsSync(cached)) return cached;
  try {
    const ggufs = readdirSync(MODELS_DIR)
      .filter((f) => f.toLowerCase().endsWith(".gguf"))
      .sort((a, b) => statSync(path.join(MODELS_DIR, b)).size - statSync(path.join(MODELS_DIR, a)).size);
    if (ggufs.length) return path.join(MODELS_DIR, ggufs[0]);
  } catch { /* models dir may not exist yet */ }
  return null;
}

async function initModel() {
  try {
    const modelPath = localModelFile();
    if (!modelPath) {
      // No runtime downloading — the model must already be in the cache.
      state.phase = "missing";
      state.error = `Cached model not found: models/${CACHED_MODEL_FILE}. Run \`npm run cache-model\` once to populate the cache.`;
      console.error(`❌ ${state.error}`);
      return;
    }
    state.cached = true;
    if (path.basename(modelPath) === CACHED_MODEL_FILE) state.modelName = MODEL_NAME;
    else state.modelName = path.basename(modelPath).replace(/\.gguf$/i, "");
    console.log(`🧠 Loading cached model (no download): ${modelPath}`);
    const { getLlama } = await import("node-llama-cpp");
    state.phase = "loading";
    llama = await getLlama();
    model = await llama.loadModel({ modelPath });
    context = await model.createContext({ contextSize: 2048, threads: Number(process.env.THREADS || 0) || undefined });
    state.phase = "ready";
    console.log("✅ VoxelChat AI is ready — cached locally, fully offline.");
  } catch (err) {
    state.phase = "error";
    state.error = String(err?.message || err);
    console.error("❌ Failed to load the cached model:", err);
  }
}

// ---------------------------------------------------------------- http
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(PUBLIC_DIR) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("Not found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleChat(req, res) {
  if (state.phase !== "ready") return sendJson(res, 503, { error: `Model is ${state.phase}. Try again in a moment.` });
  let body;
  try { body = await readBody(req); } catch { return sendJson(res, 400, { error: "Invalid JSON." }); }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user")
    return sendJson(res, 400, { error: "Send a conversation ending with a user message." });

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  // Queue behind any generation already running on the single local model.
  const run = async () => {
    if (abort.signal.aborted) return res.end();
    const { LlamaChatSession } = await import("node-llama-cpp");
    const sequence = context.getSequence();
    const session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt: SYSTEM_PROMPT,
      autoDisposeSequence: true,
    });
    try {
      const history = messages.slice(0, -1).map((m) =>
        m.role === "user"
          ? { type: "user", text: m.content }
          : { type: "model", response: [{ type: "response", text: m.content }] }
      );
      if (history.length) await session.setChatHistory(history);
      const reply = await session.prompt(messages[messages.length - 1].content, {
        signal: abort.signal,
        maxTokens: 1024,
        temperature: 0.7,
        onTextChunk: (chunk) => send("token", { text: chunk }),
      });
      send("done", { reply });
    } catch (err) {
      if (!abort.signal.aborted) send("error", { error: String(err?.message || err) });
    } finally {
      try { session.dispose(); } catch { /* already disposed */ }
      if (!res.writableEnded) res.end();
    }
  };
  chatChain = chatChain.then(run, run);
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  if (pathname === "/api/status") return sendJson(res, 200, state);
  if (pathname === "/api/retry" && req.method === "POST") {
    if (state.phase === "error" || state.phase === "missing") { state.phase = "starting"; state.error = null; initModel(); }
    return sendJson(res, 200, state);
  }
  if (pathname === "/api/chat" && req.method === "POST") return void handleChat(req, res);
  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405); res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`\n🧊 VoxelChat running at http://localhost:${PORT}`);
  console.log("   Just open that link and chat — no setup, no keys, no cloud.\n");
  initModel();
});
