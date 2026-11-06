// Tiny wrapper around Transformers.js (v3+) for running SmolLM2 in the browser.
// The library is dynamically imported so the page itself stays instant.

const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6";

let libPromise = null;

async function getLib() {
  if (!libPromise) {
    libPromise = (async () => {
      // Prefer a vendored copy (npm run vendor) so the app can run offline;
      // otherwise pull the same build from jsDelivr.
      let lib;
      try {
        lib = await import(/* @vite-ignore */ "./vendor/transformers/transformers.web.min.js");
      } catch {
        lib = await import(/* @vite-ignore */ CDN);
      }
      lib.env.allowLocalModels = false;
      lib.env.useBrowserCache = true;

      // If ONNX Runtime's WASM binaries were vendored (npm run vendor), point
      // the runtime at them instead of the jsDelivr default.
      const base = new URL("./vendor/ort/", import.meta.url).href;
      const ort = lib.env.backends?.onnx?.wasm;
      if (ort) {
        try {
          const head = await fetch(`${base}ort-wasm-simd-threaded.jsep.wasm`, { method: "HEAD" });
          if (head.ok) ort.wasmPaths = base;
        } catch {
          /* offline CDN copy is the fallback */
        }
      }
      return lib;
    })();
  }
  return libPromise;
}

export function isWebGPUAvailable() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function defaultDevice() {
  return isWebGPUAvailable() ? "webgpu" : "wasm";
}

export class SmolEngine {
  /**
   * @param {{modelId?:string, device?:'auto'|'webgpu'|'wasm',
   *          onProgress?:(info:object)=>void}} [opts]
   */
  constructor({ modelId, device, onProgress } = {}) {
    this.modelId = modelId || "onnx-community/SmolLM2-1.7B-Instruct";
    this.requestedDevice = device || "auto";
    this.device = this.requestedDevice === "auto" ? defaultDevice() : this.requestedDevice;
    this.onProgress = onProgress || (() => {});
    this.tokenizer = null;
    this.model = null;
    this._loading = null;
    this._interrupt = null;
  }

  get ready() {
    return Boolean(this.model && this.tokenizer);
  }

  async load() {
    if (this.ready) return this;
    if (!this._loading) {
      this._loading = this.#load().catch((err) => {
        this._loading = null;
        throw err;
      });
    }
    return this._loading;
  }

  async #load() {
    const t = await getLib();
    const progress_callback = (info) => this.onProgress(info);

    const loadTokenizer = async () =>
      (this.tokenizer ||= await t.AutoTokenizer.from_pretrained(this.modelId, {
        progress_callback,
      }));

    const attempt = async (device) => {
      // q4 keeps the 1.7B checkpoint around ~1.1 GB; q4f16 is the WebGPU sweet spot.
      const dtype = device === "webgpu" ? "q4f16" : "q4";
      this.tokenizer = await loadTokenizer();
      this.model = await t.AutoModelForCausalLM.from_pretrained(this.modelId, {
        dtype,
        device,
        progress_callback,
      });
      this.device = device;
    };

    try {
      await attempt(this.device);
    } catch (err) {
      if (this.device !== "webgpu") throw err;
      this.onProgress({
        status: "fallback",
        message: `WebGPU unavailable (${err?.message || err}) — using CPU/WASM`,
      });
      await attempt("wasm");
    }
    return this;
  }

  buildPrompt(messages) {
    // SmolLM2 ships a ChatML-style template in its tokenizer_config.json.
    try {
      return this.tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      });
    } catch {
      // Fallback for checkpoints without a chat_template.
      const turns = messages
        .map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`)
        .join("");
      return `${turns}<|im_start|>assistant\n`;
    }
  }

  /**
   * Stream a reply token by token.
   * @param {Array<{role:string, content:string}>} messages
   * @param {{temperature?:number, top_p?:number, max_new_tokens?:number,
   *          onToken?:(chunk:string)=>void, onStats?:(s:object)=>void}} [opts]
   * @returns {Promise<{text:string, interrupted:boolean}>}
   */
  async chat(messages, opts = {}) {
    await this.load();
    const t = await getLib();

    const inputs = await this.tokenizer(this.buildPrompt(messages));
    const promptLength = inputs.input_ids.dims.at(-1);

    const interrupt = new t.InterruptableStoppingCriteria();
    this._interrupt = interrupt;

    let full = "";
    let tokens = 0;
    let firstTokenMs = null;
    const startedAt = performance.now();

    const streamer = new t.TextStreamer(this.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (chunk) => {
        if (!chunk) return;
        if (firstTokenMs === null) firstTokenMs = performance.now() - startedAt;
        tokens++;
        full += chunk;
        opts.onToken?.(chunk);
      },
    });

    try {
      const out = await this.model.generate({
        ...inputs,
        max_new_tokens: opts.max_new_tokens ?? 256,
        do_sample: true,
        temperature: opts.temperature ?? 0.7,
        top_p: opts.top_p ?? 0.95,
        repetition_penalty: 1.1,
        streamer,
        stopping_criteria: [interrupt],
      });

      // Safety net: streamer produced nothing (e.g. odd template) — decode raw.
      if (!full && out?.sequences) {
        const text = this.tokenizer.batch_decode(out.sequences.slice(null, [promptLength, null]), {
          skip_special_tokens: true,
        })[0];
        full = text || "";
        if (full) opts.onToken?.(full);
      }
    } catch (err) {
      if (!interrupt.interrupted) throw err;
    } finally {
      this._interrupt = null;
    }

    const seconds = (performance.now() - startedAt) / 1000;
    opts.onStats?.({
      interrupted: interrupt.interrupted,
      tokens,
      seconds,
      tokensPerSecond: seconds > 0 ? tokens / seconds : 0,
      ttftMs: firstTokenMs,
      device: this.device,
    });

    return { text: full.trim(), interrupted: interrupt.interrupted };
  }

  stop() {
    this._interrupt?.interrupt();
  }
}
