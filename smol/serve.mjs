// Zero-dependency static server for the Smol chat.
//   node smol/serve.mjs [port]
//
// Serves the smol/ folder with the headers WebGPU + multi-threaded WASM want
// (COOP/COEP) and a range-less, cache-friendly model file passthrough.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const HOST = process.env.HOST || "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

function headers(type) {
  return {
    "Content-Type": type,
    // Not strictly required for WebGPU, but enables multi-threaded WASM.
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "credentialless",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cache-Control": "public, max-age=3600",
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    const target = normalize(join(ROOT, pathname));
    if (!target.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }

    const info = await stat(target).catch(() => null);
    if (!info || !info.isFile()) {
      // SPA-ish fallback so /anything still opens the chat.
      if (!extname(pathname)) {
        const html = await readFile(join(ROOT, "index.html"));
        res.writeHead(200, headers(TYPES[".html"])).end(html);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
      return;
    }

    const type = TYPES[extname(target).toLowerCase()] || "application/octet-stream";
    const body = await readFile(target);
    res.writeHead(200, { ...headers(type), "Content-Length": body.length }).end(body);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end(String(err?.message || err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Smol is running → http://localhost:${PORT}`);
});
