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
  resolveModelFile,
} from "node-llama-cpp";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, "..", "models");

export const DEFAULT_MODEL =
  process.env.SMOL_MODEL || "hf:bartowski/SmolLM2-1.7B-Instruct-GGUF:Q4_K_M";

const state = {
  phase: "idle", // idle | downloading | loading | ready | error
  progress: null, // {downloadProgress 0..1, sizeMb, file}
  error: null,
  backend: null, // cpu / metal / cuda / vulkan
  modelId: null,
  modelPath: null,
  promptTokens: 0,
  contextSize: 0,
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
    llamaPromise = getLlama({ logLevel: LlamaLogLevel.warn });
  }
  return llamaPromise;
}

/**
 * Download (if needed) and load the GGUF, then create a chat session.
 * Safe to call repeatedly; concurrent callers share one load.
 */
export async function ensureModel({ modelUri = DEFAULT_MODEL, sysPrompt = "" } = {}) {
  if (model && session && modelUri === state.modelId) {
    if (sysPrompt !== systemPrompt) {
      systemPrompt = sysPrompt;
      rebuildSession();
    }
    return model;
  }
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    state.modelId = modelUri;
    state.error = null;

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
    const modelPath = await resolveModelFile(modelUri, {
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

    // 2. spin up llama.cpp and load the weights
    state.phase = "loading";
    state.progress = { downloadProgress: 1, sizeMb: 0, file: path.basename(modelPath) };
    const llama = await getLlamaInstance();
    state.backend = llama.gpu === false ? "cpu" : String(llama.gpu);

    if (model) await model.dispose();
    model = await llama.loadModel({
      modelPath,
      gpuLayers: "auto",
      // Generation prompt prefixes can't be "erased" by context shift, so a big
      // model window keeps as much of the conversation resident as possible.
      defaultContextFlashAttention: true,
    });

    // 3. one context + one chat session, reused across turns (keeps the KV cache)
    if (context) await context.dispose();
    // Respect the model's trained window: SmolLM2 is 8k, but a custom GGUF may be
    // much smaller, and asking for too much makes llama.cpp refuse to build a context.
    const trained = model.trainContextSize || 4096;
    const contextSize = Math.max(512, Math.min(8192, trained));
    context = await model.createContext({ contextSize });
    systemPrompt = sysPrompt;
    rebuildSession();

    state.phase = "ready";
    state.progress = null;
    state.contextSize = context.contextSize;
    state.trainContextSize = model.trainContextSize;
    state.promptTokens = 0;
    return model;
  })().catch((err) => {
    state.phase = "error";
    state.error = String(err?.message || err);
    modelPromise = null;
    session = null;
    throw err;
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
    state.promptTokens = session.sequence.tokenMeter?.getState?.().usedInputTokens ?? state.promptTokens;
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
