# Smol — a SmolLM2-1.7B character in your browser

A single-page chat with **Smol**, a character powered by
[`onnx-community/SmolLM2-1.7B-Instruct`](https://huggingface.co/onnx-community/SmolLM2-1.7B-Instruct).
The model runs **entirely client-side** with [Transformers.js](https://huggingface.co/docs/transformers.js)
(WebGPU when available, quantized q4 WASM otherwise). No API keys, no server-side inference —
your messages never leave the tab.

## Run it

```bash
npm start            # http://localhost:5173
```

`npm i && npm run vendor` is only needed if you want the Transformers.js runtime served
locally instead of pulled from jsDelivr (offline / restricted-network setups).

## What's in here

| File | Purpose |
| --- | --- |
| `index.html` | Chat shell: header, transcript, composer, settings dialog |
| `styles.css` | Dark theme, bubbles, streaming cursor, load progress bar |
| `chat.js` | UI glue: conversation state, streaming paint loop, settings, persistence |
| `engine.js` | `SmolEngine` — loads the model, applies the ChatML template, streams tokens, cancellable |
| `markdown.js` | ~70-line markdown renderer (fenced code, lists, bold/italic, quotes, links), HTML-escaped |
| `serve.mjs` | Zero-dependency static server with `application/wasm` + COOP/COEP headers |
| `vendor/` | Optional local copy of transformers.js + the ORT WASM binary (`npm run vendor`) |

## Notes

- **First load downloads ~1.1 GB** of quantized weights from the Hugging Face CDN
  (`q4` for WASM, `q4f16` for WebGPU). They're cached by the browser, so later visits are fast.
- **WebGPU** is strongly recommended: expect a few dozen tokens/sec. Pure WASM on the CPU is
  maybe 2–6 tok/s for 1.7B, which is why the model warms up as soon as the page opens.
- If WebGPU initialization fails (old driver, Safari fp16 quirks), `engine.js` automatically
  retries on WASM and reports it in the status pill.
- All knobs — system prompt, model id, device, temperature, top-p, max tokens — live behind the
  ⚙︎ button and persist in `localStorage`. Clearing the chat (⟲) resets the transcript.
