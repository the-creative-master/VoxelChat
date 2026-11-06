# Smol — a SmolLM2-1.7B character on node-llama.cpp

A single-page chat with **Smol**, a character powered by
[`SmolLM2-1.7B-Instruct`](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct)
running on **[node-llama.cpp](https://github.com/withcatai/node-llama-cpp)** locally.
No cloud API, no API keys — the model runs on your own machine.

```
npm i
npm start            # → http://localhost:5173
npm run doctor       # if anything misbehaves: checks node, llama.cpp, model, tokenizer, inference
```

First run downloads `bartowski/SmolLM2-1.7B-Instruct-GGUF` **Q4_K_M** (~1.05 GB) into
`models/` via Hugging Face. Later starts load from disk in a second or two. The model
stays resident in the server process, so the first token is fast after that.

## Architecture

```
browser (smol/index.html + chat.js)          node process (smol/serve.mjs)
─────────────────────────────────            ───────────────────────────────
chat UI, markdown, settings  ──HTTP/NDJSON──▶  node-llama.cpp (smol/llm.mjs)
                                              SmolLM2-1.7B-Instruct Q4_K_M
```

Inference is native code, so it can't live inside the tab: the browser talks to a tiny
local API and receives tokens as they're generated.

| Route | Purpose |
| --- | --- |
| `GET /` | chat UI |
| `GET /api/status` | phase (`downloading`/`loading`/`ready`/`error`), download %, backend, context size |
| `POST /api/load` | `{modelId?, systemPrompt?}` — download + load, non-blocking |
| `POST /api/chat` | `{messages, temperature, top_p, min_p, max_tokens}` → NDJSON `{type:"chunk"}`… `{type:"done"}` |
| `POST /api/upload?name=&offset=&last=` | chunked GGUF upload from the browser → `models/uploaded/` |
| `POST /api/stop` | abort the running generation |
| `POST /api/reset` | forget the conversation, keep the weights in RAM |

## Files

| File | Purpose |
| --- | --- |
| `smol/index.html`, `smol/styles.css` | chat shell, dark theme, streaming cursor, progress bar |
| `smol/chat.js` | conversation state, streaming paint loop, settings, `localStorage` history |
| `smol/engine.js` | browser client: `/api/*` calls, NDJSON stream parsing, abort |
| `smol/llm.mjs` | llama.cpp side: model resolution/download, context + `LlamaChatSession`, token streaming |
| `smol/markdown.js` | ~70-line HTML-escaping markdown renderer |
| `smol/serve.mjs` | static server + JSON/NDJSON API |

## Troubleshooting

Run **`npm run doctor`** first — it reports exactly which layer fails:

| Symptom | Fix |
| --- | --- |
| `native llama.cpp loaded` fails | `npm rebuild node-llama-cpp`, or `npx --no node-llama-cpp source download --gpu false` |
| "couldn't reach Hugging Face" (401/TLS/fetch failed) | The server process can't reach the model host. Either download the GGUF manually and run `SMOL_MODEL=/path/to/model.gguf npm start`, **or** click **Download model in my browser** in the UI — the page fetches the file (chunked) and POSTs it to `/api/upload`, and the backend loads it from `models/uploaded/` |
| tokenizer produced zero tokens | the file isn't a chat model (vocab-only/embedding GGUF) — use a full `*instruct*` GGUF |
| page says "backend offline" | `npm start` isn't running; open the URL it prints (not the `.html` file directly) |

## Settings

The ⚙︎ panel controls the system prompt, model id, temperature, top-p, min-p and max new
tokens. Values persist in `localStorage`.

- **System prompt** — applied immediately (reloads the session, keeps the weights warm).
- **Model id** — any node-llama-cpp model URI (`hf:user/repo:quant`), an HF/HTTPS URL, or a
  local `.gguf` path. Changing it triggers a reload; downloads are cached in `models/`.
- `SMOL_MODEL=/path/to/model.gguf npm start` sets the server default instead.

## Notes

- SmolLM2 supports an 8k context; the server uses the model's trained window (capped at 8k,
  min 512) and node-llama-cpp erases old turns when it fills up.
- WebGPU/CUDA/Metal are used automatically by llama.cpp when available (`gpuLayers: "auto"`);
  otherwise it runs on the CPU. The status pill shows which backend is live.
- `models/` and `*.gguf` are git-ignored — weights are never committed.
