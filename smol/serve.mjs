// Smol server: static UI + a small streaming inference API backed by node-llama.cpp.
//   node smol/serve.mjs [port]
//
// Routes
//   GET  /                     chat UI
//   GET  /api/status           model/backend/download state
//   POST /api/load             {modelId?, systemPrompt?} start download+load
//   POST /api/chat             {messages, temperature, top_p, min_p, max_tokens}
//                              → NDJSON stream of {type:"chunk"|"done"|"error"}
//   POST /api/stop             abort the running generation
//   POST /api/reset            drop the conversation (keeps the model in RAM)

import { createServer } from "node:http";
import { createWriteStream } from "node:fs";
import { readFile, rename, stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MODEL,
  chat,
  ensureModel,
  ensureUploadDir,
  getState,
  latestUploadedModel,
  resetConversation,
  stopGeneration,
} from "./llm.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const HOST = process.env.HOST || "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS,
  });
  res.end(payload);
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid JSON body");
  }
}

// ---------------------------------------------------------------- API

// One generation at a time: llama.cpp contexts aren't safe for concurrent prompts,
// and overlapping requests used to wedge the session.
let chatQueue = Promise.resolve();

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS).end();
    return true;
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    json(res, 200, {
      ...getState(),
      defaultModel: latestUploadedModel() || DEFAULT_MODEL,
    });
    return true;
  }

  if (url.pathname === "/api/load" && req.method === "POST") {
    const body = await readBody(req);
    const modelId =
      body.modelId || latestUploadedModel() || DEFAULT_MODEL;
    const systemPrompt = body.systemPrompt || "";
    // Kick off load in the background; the client polls /api/status for progress.
    ensureModel({
      modelUri: modelId,
      sysPrompt: systemPrompt,
      useLocal: Boolean(body.local),
    }).catch((err) =>
      console.error("model load failed:", err?.message || err)
    );
    json(res, 202, { ok: true, modelId });
    return true;
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      ...CORS,
    });

    // If the browser goes away mid-generation, stop burning CPU.
    let closed = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        closed = true;
        stopGeneration();
      }
    });

    const emit = (event) => {
      if (closed || res.writableEnded) return;
      res.write(JSON.stringify(event) + "\n");
    };

    const run = async () => {
      if (getState().phase !== "ready") {
        emit({ type: "status", phase: getState().phase || "loading" });
        await ensureModel();
      }
      await chat(
        messages,
        {
          temperature: body.temperature,
          top_p: body.top_p,
          min_p: body.min_p,
          max_tokens: body.max_tokens,
        },
        emit
      );
    };

    const task = chatQueue.then(run, run).catch((err) => {
      emit({ type: "error", message: String(err?.message || err) });
    });
    chatQueue = task.catch(() => {});
    await task;
    if (!res.writableEnded) res.end();
    return true;
  }

  // Browser-fetched model: the page can reach Hugging Face even when this
  // process can't, so it POSTs the raw GGUF bytes here and we keep them in
  // models/uploaded/ and load them.
  if (url.pathname === "/api/upload" && req.method === "POST") {
    const name = String(url.searchParams.get("name") || "model.gguf").replace(/[^\w.\-]/g, "_");
    if (!name.endsWith(".gguf")) {
      json(res, 400, { error: "expected a .gguf file" });
      return true;
    }
    const dir = await ensureUploadDir();
    const target = join(dir, name);
    const partial = `${target}.part`;
    // Chunked upload: the browser POSTs the file in slices (?offset=N) so a ~1 GB
    // model doesn't have to survive a single proxied request-body limit.
    const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
    const last = url.searchParams.get("last") === "1";
    try {
      await pipeline(req, createWriteStream(partial, { flags: offset === 0 ? "w" : "a" }));
      const info = await stat(partial);
      if (!last) {
        json(res, 200, { ok: true, partial: true, sizeMb: Math.round(info.size / 1024 / 1024) });
        return true;
      }
      // Validate the GGUF magic bytes rather than guessing from the size — a
      // blocked download usually lands an HTML/JSON error page instead.
      const magic = await readFile(partial)
        .then((b) => b.subarray(0, 4).toString("latin1"))
        .catch(() => "");
      if (magic !== "GGUF" || info.size < 4096) {
        await unlink(partial).catch(() => {});
        json(res, 400, {
          error:
            magic === "GGUF"
              ? `file too small (${info.size} bytes)`
              : `not a GGUF file (starts with ${JSON.stringify(magic)}) — the download was blocked or redirected to a login page`,
        });
        return true;
      }
      await unlink(target).catch(() => {});
      await rename(partial, target);
      json(res, 200, { ok: true, path: target, sizeMb: Math.round(info.size / 1024 / 1024) });
      ensureModel({
        modelUri: target,
        useLocal: true,
        sysPrompt: getState().systemPrompt || "",
      }).catch((err) => console.error("uploaded model load failed:", err?.message || err));
    } catch (err) {
      await unlink(partial).catch(() => {});
      json(res, 500, { error: String(err?.message || err) });
    }
    return true;
  }

  if (url.pathname === "/api/stop" && req.method === "POST") {
    stopGeneration();
    json(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/reset" && req.method === "POST") {
    resetConversation();
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}

// ------------------------------------------------------------- static

async function handleStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const target = normalize(join(ROOT, pathname));
  if (!target.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  const info = await stat(target).catch(() => null);
  if (!info || !info.isFile()) {
    if (!extname(pathname)) {
      const html = await readFile(join(ROOT, "index.html"));
      res.writeHead(200, { "Content-Type": TYPES[".html"] }).end(html);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
    return;
  }

  const type = TYPES[extname(target).toLowerCase()] || "application/octet-stream";
  const body = await readFile(target);
  res
    .writeHead(200, { "Content-Type": type, "Content-Length": body.length, "Cache-Control": "no-cache" })
    .end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) json(res, 404, { error: "unknown endpoint" });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, CORS).end("method not allowed");
      return;
    }
    await handleStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(err?.message || err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Smol is running → http://localhost:${PORT}`);
  console.log(`model: ${DEFAULT_MODEL} (cached in ./models)`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopGeneration();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
