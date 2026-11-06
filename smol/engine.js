// Client for the local node-llama.cpp server (smol/llm.mjs).
// Generation streams back as newline-delimited JSON; we hand chunks to the UI
// as they arrive and can abort mid-reply.

const BASE = ""; // same origin as the page

async function postJson(path, body, signal) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

export class SmolEngine {
  /**
   * @param {{modelId?:string, systemPrompt?:string}} [opts]
   */
  constructor({ modelId, systemPrompt } = {}) {
    this.modelId = modelId || "";
    this.systemPrompt = systemPrompt || "";
    this.status = { phase: "idle", progress: null, backend: null, contextSize: 0 };
    this._poll = null;
    this._abort = null;
    this._onStatus = () => {};
  }

  get ready() {
    return this.status.phase === "ready";
  }

  onStatus(fn) {
    this._onStatus = fn;
    return this;
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt || "";
  }

  /** Apply a new system prompt server-side; keeps the weights loaded, resets chat memory. */
  async applySystemPrompt(prompt) {
    this.setSystemPrompt(prompt);
    return postJson("/api/load", { systemPrompt: this.systemPrompt }).catch(() => {});
  }

  /** Ask the server to load (downloading the GGUF if needed) and report progress. */
  async load({ onStatus, modelId, systemPrompt } = {}) {
    if (onStatus) this._onStatus = onStatus;

    // Fail fast with a clear message if the node-llama.cpp server isn't running.
    if (!(await this.refreshStatus())) {
      throw new Error("no llama.cpp backend — start it with `npm start`");
    }
    if (modelId) this.modelId = modelId;
    if (systemPrompt !== undefined) this.systemPrompt = systemPrompt;

    if (this.ready) return this.status;

    await postJson("/api/load", {
      modelId: this.modelId || undefined,
      systemPrompt: this.systemPrompt,
    });

    // Poll until ready, error, or the tab is closed.
    if (!this._poll) {
      this._poll = new Promise((resolve, reject) => {
        const tick = async () => {
          try {
            const res = await fetch(`${BASE}/api/status`, { cache: "no-store" });
            this.status = await res.json();
            this._onStatus(this.status);
            if (this.status.phase === "ready") return resolve(this.status);
            if (this.status.phase === "error")
              return reject(new Error(this.status.error || "model failed to load"));
            setTimeout(tick, 700);
          } catch (err) {
            reject(err);
          }
        };
        tick();
      }).finally(() => {
        this._poll = null;
      });
    }
    return this._poll;
  }

  async refreshStatus() {
    try {
      const res = await fetch(`${BASE}/api/status`, { cache: "no-store" });
      this.status = await res.json();
      this._onStatus(this.status);
    } catch {
      return null; // backend not reachable
    }
    return this.status;
  }

  /**
   * Stream a reply.
   * @param {Array<{role:'user'|'assistant', content:string}>} messages
   * @param {{temperature?:number, top_p?:number, min_p?:number, max_tokens?:number,
   *          onToken?:(t:string)=>void, onStats?:(s:object)=>void}} [opts]
   * @returns {Promise<string>} full reply text
   */
  async chat(messages, opts = {}) {
    const abort = new AbortController();
    this._abort = abort;

    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages,
        temperature: opts.temperature ?? 0.7,
        top_p: opts.top_p ?? 0.95,
        min_p: opts.min_p,
        max_tokens: opts.max_tokens ?? 256,
      }),
      signal: abort.signal,
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`chat failed (HTTP ${res.status}) ${detail.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let stats = null;
    let failure = null;

    const handleLine = (line) => {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event.type === "chunk" && event.text) {
        full += event.text;
        opts.onToken?.(event.text);
      } else if (event.type === "status") {
        opts.onStatus?.({ phase: event.phase });
      } else if (event.type === "done") {
        if (event.text) full = event.text;
        stats = event;
      } else if (event.type === "error") {
        failure = event.message;
      }
    };

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          handleLine(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 1);
        }
      }
      handleLine(buffer);
    } catch (err) {
      if (!abort.signal.aborted) throw err;
    } finally {
      if (this._abort === abort) this._abort = null;
    }

    if (failure) throw new Error(failure);
    if (stats) opts.onStats?.(stats);
    return full.trim();
  }

  /**
   * Stream a GGUF from a URL through this browser into the server's models dir.
   * Works when the server process itself can't reach the host (firewalled sandbox,
   * TLS interception, corporate proxy) but the browser can.
   * @param {string} url
   * @param {{onProgress?:(p:{received:number,total:number,fraction:number})=>void, signal?:AbortSignal}} [opts]
   */
  async uploadModelFromUrl(url, opts = {}) {
    const res = await fetch(url, { signal: opts.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`download failed → HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length") || 0);
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "model.gguf");

    const reader = res.body.getReader();
    const CHUNK = 16 * 1024 * 1024; // slice size; comfortably under proxy limits
    let buf = new Uint8Array(0);
    let received = 0;

    const flush = async (blob, offset, last) => {
      const q = new URLSearchParams({ name, offset: String(offset), last: last ? "1" : "0" });
      const out = await fetch(`${BASE}/api/upload?${q}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: blob,
        signal: opts.signal,
      });
      const body = await out.json().catch(() => ({}));
      if (!out.ok) throw new Error(body.error || `upload failed → HTTP ${out.status}`);
      return body;
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const merged = new Uint8Array(buf.length + value.length);
      merged.set(buf, 0);
      merged.set(value, buf.length);
      buf = merged;
      received += value.length;

      while (buf.length >= CHUNK) {
        await flush(buf.slice(0, CHUNK), received - buf.length, false);
        buf = buf.slice(CHUNK);
      }
      opts.onProgress?.({ received, total, fraction: total ? received / total : 0 });
    }

    if (buf.length || received === 0) {
      await flush(buf.slice(0), received - buf.length, true);
    }
    opts.onProgress?.({ received, total, fraction: 1 });
    return { ok: true, sizeMb: Math.round(received / 1048576) };
  }

  stop() {
    this._abort?.abort();
    // Also tell the server to drop the in-flight evaluation.
    postJson("/api/stop").catch(() => {});
  }

  reset() {
    this.stop();
    return postJson("/api/reset").catch(() => {});
  }
}

export function isWebGPUAvailable() {
  return false; // inference is native here; GPU is handled by llama.cpp
}
