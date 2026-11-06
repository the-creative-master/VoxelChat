// Smol's brain: node-llama.cpp running SmolLM2-1.7B-Instruct (GGUF) natively.
//
// Why a server at all? llama.cpp is compiled native code — it can't run inside a
// browser tab. So the model lives in this Node process and the chat page talks to
// it over a tiny streaming JSON API. Nothing leaves your machine.

import {
  getLlama,
  LlamaLogLevel,
  LlamaChatSession,
  ChatMLChatWrapper,
  readGgufFileInfo,
  resolveModelFile,
} from "node-llama-cpp";
import path from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, "..", "models");

/**
 * Where uploaded/cached GGUFs live when the server can't reach Hugging Face.
 */
export const UPLOAD_DIR = path.join(MODELS_DIR, "uploaded");

/**
 * How much room is left for a browser-uploaded model (models are ~1 GB).
 */
export async function ensureUploadDir() {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

/**
 * Model to use when the client doesn't ask for one: an explicit SMOL_MODEL, else
 * the most recent browser-uploaded GGUF, else the Hugging Face default.
 */
export const DEFAULT_MODEL =
  process.env.SMOL_MODEL || "hf:bartowski/SmolLM2-1.7B-Instruct-GGUF:Q4_K_M";

/** Newest GGUF a browser uploaded earlier (survives restarts). */
export function latestUploadedModel() {
  try {
    const files = readdirSync(UPLOAD_DIR)
      .filter((f) => f.endsWith(".gguf"))
      .map((f) => {
        const full = path.join(UPLOAD_DIR, f);
        return { full, mtime: statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.full ?? null;
  } catch {
    return null;
  }
}

const state = {
  phase: "idle", // idle | downloading | loading | ready | error
  progress: null, // {downloadProgress 0..1, sizeMb, file}
  error: null,
  backend: null, // cpu / metal / cuda / vulkan
  modelId: null,
  modelPath: null,
  architecture: null,
  modelName: null,
  promptTokens: 0,
  contextSize: 0,
  systemPrompt: "",
  busy: false,
};

export const getState = () => ({ ...state });

let llamaPromise = null;
let modelPromise = null;
let model = null;
let context = null;
let session = null;
let sessionHistory = []; // [{role, content}] already fed to the model
let currentAbort = null;
let systemPrompt = "";

async function getLlamaInstance() {
  if (!llamaPromise) {
    llamaPromise = getLlama({ logLevel: LlamaLogLevel.warn }).catch((err) => {
      llamaPromise = null;
      const hint = process.platform === "win32"
        ? "Install the VC++ redistributable or run `npx --no node-llama-cpp source download --gpu false`."
        : "Run `npm rebuild node-llama-cpp` (or `npx --no node-llama-cpp source download`).";
      throw new Error(
        `llama.cpp binary could not start on this machine (${err?.message || err}). ${hint}`
      );
    });
  }
  return llamaPromise;
}

/**
 * Download (if needed) and load the GGUF, then create a chat session.
 * Safe to call repeatedly; concurrent callers share one load.
 */
export async function ensureModel({ modelUri = DEFAULT_MODEL, sysPrompt = "", useLocal = false } = {}) {
  if (model && session && modelUri === state.modelId && state.phase === "ready") {
    if (sysPrompt !== systemPrompt) {
      systemPrompt = sysPrompt;
      state.systemPrompt = systemPrompt;
      rebuildSession();
    }
    return model;
  }
  if (modelPromise) {
    // A load is in flight; if it's for a different file, wait for it to finish and
    // then load this one rather than silently returning the wrong model.
    await modelPromise.catch(() => {});
    if (model && session && modelUri === state.modelId && state.phase === "ready") return model;
  }

  modelPromise = (async () => {
    state.modelId = modelUri;
    state.phase = "downloading";
    state.error = null;
    state.architecture = null;
    state.modelName = null;

    // 1. resolve/download the GGUF file (cached in ./models)
    // A plain filesystem path (absolute, or relative to the CWD / models dir)
    // should be loaded as-is; only URIs like `hf:user/repo:quant` get downloaded.
    const localCandidates = [modelUri, path.resolve(process.cwd(), modelUri), path.join(MODELS_DIR, path.basename(modelUri))];
    const localPath = localCandidates.find((p) => existsSync(p) && p.endsWith(".gguf"));
    if (localPath && !/^(hf|https?):/i.test(modelUri)) {
      modelUri = path.resolve(localPath);
    }

    state.phase = "downloading";
    state.progress = { downloadProgress: 0, sizeMb: 0, file: modelUri };
    const modelPath = useLocal ? modelUri : await resolveModelFile(modelUri, {
      directory: MODELS_DIR,
      cli: false,
      onProgress: ({ totalSize, downloadedSize }) => {
        state.progress = {
          downloadProgress: totalSize ? downloadedSize / totalSize : 0,
          sizeMb: downloadedSize / 1024 / 1024,
          totalMb: totalSize / 1024 / 1024,
          file: path.basename(modelUri),
        };
      },
    });
    state.modelPath = modelPath;

    // 1b. cheap sanity check: a good GGUF round-trips text through its tokenizer.
    // If it can't, generation would produce garbage, so fail loudly instead.
    const fileInfo = await readGgufFileInfo(modelPath, { readTensorsInfo: false }).catch(() => null);
    const md = fileInfo?.metadata?.general ?? fileInfo?.metadata ?? {};
    state.architecture = md.architecture ?? fileInfo?.architecture ?? null;
    state.modelName = md.name ?? null;

    // 2. spin up llama.cpp and load the weights
    state.phase = "loading";
    state.progress = { downloadProgress: 1, sizeMb: 0, file: path.basename(modelPath) };
    const llama = await getLlamaInstance();
    state.backend = llama.gpu === false ? "cpu" : String(llama.gpu);

    if (model) await model.dispose();
    const loadModel = (opts) =>
      llama.loadModel(opts).catch((err) => {
        // Older node-llama-cpp builds don't know some options; retry minimal.
        if (String(err?.message || err).toLowerCase().includes("unknown option")) {
          console.warn("retrying model load without extended options:", err?.message);
          return llama.loadModel({ modelPath, gpuLayers: "auto" });
        }
        throw err;
      });
    model = await loadModel({
      modelPath,
      gpuLayers: "auto",
      defaultContextFlashAttention: "auto",
    });

    // llama.cpp happily loads files whose tokenizer it can't use; catch that here.
    const probe = "hello";
    const probeTokens = model.tokenize(probe);
    if (probeTokens.length === 0) {
      throw new Error(
        `this GGUF's tokenizer cannot encode text (${state.architecture || "unknown"} architecture). ` +
          "The file is probably not a chat model (a vocab-only or embedding GGUF?) — try a full instruct model."
      );
    }

    // 3. one context + one chat session, reused across turns (keeps the KV cache)
    if (context) await context.dispose();
    // Respect the model's trained window: SmolLM2 is 8k, but a custom GGUF may be
    // much smaller, and asking for too much makes llama.cpp refuse to build a context.
    const trained = model.trainContextSize || 4096;
    const contextSize = Math.max(512, Math.min(8192, trained));
    context = await model.createContext({ contextSize });
    systemPrompt = sysPrompt;
    state.systemPrompt = systemPrompt;
    rebuildSession();

    state.phase = "ready";
    state.progress = null;
    state.contextSize = context.contextSize;
    state.trainContextSize = model.trainContextSize;
    state.promptTokens = 0;
    return model;
  })().catch((err) => {
    state.phase = "error";
    state.error = friendlyError(err);
    modelPromise = null;
    session = null;
    throw new Error(state.error);
  });

  return modelPromise;
}

function rebuildSession() {
  session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    chatWrapper: new ChatMLChatWrapper(),
    systemPrompt: systemPrompt || undefined,
    autoDisposeSequence: true,
    contextShift: { strategy: "eraseFirstResponseAndKeepFirstSystem" },
  });
  sessionHistory = [];
}

export function resetConversation() {
  currentAbort?.abort();
  sessionHistory = [];
  if (session) session.resetChatHistory();
}

export function stopGeneration() {
  currentAbort?.abort();
}

/**
 * Stream a reply. `messages` is the full client-side transcript
 * (system messages excluded — the system prompt is set at load time).
 *
 * @param {Array<{role:string, content:string}>} messages
 * @param {{temperature?:number, top_p?:number, min_p?:number, max_tokens?:number}} opts
 * @param {(event:object)=>void} emit called with {type:'chunk'|'done'|'error', ...}
 */
export async function chat(messages, opts, emit) {
  if (!session) throw new Error(state.error || "model is not loaded");
  const userTurns = messages.filter((m) => m.role === "user" || m.role === "assistant");
  if (!userTurns.length) throw new Error("no messages");

  const last = userTurns[userTurns.length - 1];
  if (last.role !== "user") throw new Error("last message must be from the user");

  // Guard against GGUFs whose tokenizer can't encode the text at all — better a
  // clear error than llama.cpp's cryptic "No tokens to evaluate".
  if (model.tokenize(last.content).length === 0) {
    throw new Error(
      "the model tokenizer produced no tokens for that message (unsupported GGUF vocabulary?)"
    );
  }

  const prior = userTurns.slice(0, -1);

  // Fast path: the model already has this exact conversation → only feed the new turn.
  // Otherwise replay the transcript into a fresh session state.
  if (!sameHistory(prior, sessionHistory)) {
    session.resetChatHistory();
    if (prior.length) {
      session.setChatHistory(
        prior.map((m) =>
          m.role === "user"
            ? { type: "user", text: m.content }
            : { type: "model", response: [m.content] }
        )
      );
    }
  }

  const abort = new AbortController();
  currentAbort = abort;
  state.busy = true;

  const startedAt = performance.now();
  let tokens = 0;
  let firstTokenMs = null;
  let text = "";

  try {
    const result = await session.promptWithMeta(last.content, {
      temperature: opts?.temperature ?? 0.7,
      topP: opts?.top_p ?? 0.95,
      minP: opts?.min_p,
      maxTokens: opts?.max_tokens ?? 256,
      repeatPenalty: { penalty: 1.1, frequencyPenalty: 0, presencePenalty: 0, lastTokens: 64 },
      signal: abort.signal,
      stopOnAbortSignal: true,
      onToken: () => {
        tokens++;
        if (firstTokenMs === null) firstTokenMs = performance.now() - startedAt;
      },
      onTextChunk: (chunk) => {
        if (!chunk) return;
        text += chunk;
        emit({ type: "chunk", text: chunk });
      },
    });

    text = (result.responseText ?? text).trim();
    sessionHistory = [...prior, { role: "user", content: last.content }, ...(text ? [{ role: "assistant", content: text }] : [])];
    const meterState = session.sequence.tokenMeter?.getState?.();
    state.promptTokens = meterState?.usedInputTokens ?? state.promptTokens;
    state.contextSize = context.contextSize;
    state.trainContextSize = model.trainContextSize;

    const seconds = (performance.now() - startedAt) / 1000;
    emit({
      type: "done",
      text,
      stopReason: result.stopReason,
      tokens,
      seconds,
      tokensPerSecond: seconds > 0 ? tokens / seconds : 0,
      ttftMs: firstTokenMs,
      contextUsed: session.sequence.tokenMeter?.getState?.().usedInputTokens ?? null,
      contextSize: context.contextSize,
      backend: state.backend,
    });
  } catch (err) {
    if (abort.signal.aborted) {
      emit({ type: "done", text, stopReason: "abort", tokens, aborted: true });
    } else {
      state.error = String(err?.message || err);
      emit({ type: "error", message: state.error });
    }
  } finally {
    state.busy = false;
    if (currentAbort === abort) currentAbort = null;
  }
}

/** Turn low-level download/loader failures into something actionable in the UI. */
function friendlyError(err) {
  const msg = String(err?.message || err);
  const net = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|UNABLE_TO_VERIFY|certificate|socket hang up|network/i;
  if (net.test(msg)) {
    return (
      `couldn't reach Hugging Face to download the model (${msg}). ` +
      "Check your connection/proxy/VPN or antivirus TLS inspection, or download the GGUF yourself and run: " +
      "SMOL_MODEL=/path/to/model.gguf npm start. Diagnose with: npm run doctor"
    );
  }
  return msg;
}

function sameHistory(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].role !== b[i].role || a[i].content !== b[i].content) return false;
  }
  return true;
}

export async function disposeAll() {
  currentAbort?.abort();
  await session?.dispose?.({ disposeSequence: true });
  await context?.dispose?.();
  await model?.dispose?.();
  session = null;
  context = null;
  model = null;
}
