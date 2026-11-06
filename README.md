# VoxelChat

A local AI chat app. Chat with **SmolLM2 1.7B Instruct** running entirely on your own
machine through [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp).

No API keys. No accounts. Nothing you type is sent to a third party — the model runs in
the same process as the server on your computer.

> The name is just a name; there is no voxel rendering here.

## Requirements

- **Node.js 20 or newer**
- **~1.5 GB free disk space** (1.06 GB model + llama.cpp binaries)
- Any modern browser
- No GPU required — it runs on the CPU. A GPU is used automatically if one is available.

## Quick start

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

On the first run, VoxelChat downloads the model (~1.06 GB) into `models/` and shows
progress in the sidebar. This happens once. Every run after that loads from disk in a
few seconds.

To use a different port:

```bash
PORT=8080 npm start
```

## The model

| | |
|---|---|
| Model | SmolLM2 1.7B Instruct |
| Parameters | 1.7B |
| Quantization | Q4_K_M |
| File size | ~1.06 GB |
| Context window | 4096 tokens |
| Source | [HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF) |

Only this one model is supported for now. The catalog lives in `src/models.js` — it is a
single-entry array, so adding a second model later is a matter of adding another object.

## Configuration

All configuration is optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `VOXELCHAT_MODEL_PATH` | *(unset)* | Absolute path to an existing `.gguf` file. Skips the download entirely — useful offline or on a slow connection. |
| `VOXELCHAT_MODELS_DIR` | `./models` | Where downloaded models are stored. |
| `VOXELCHAT_AUTO_LOAD` | `true` | Set to `false` to defer loading until the first message. |
| `VOXELCHAT_MAX_TOKENS` | `512` | Maximum tokens generated per reply. |

Example, using a model file you already have:

```bash
VOXELCHAT_MODEL_PATH=/path/to/smollm2-1.7b-instruct-q4_k_m.gguf npm start
```

## How it works

```
Browser (public/)                    Server (Node)                      llama.cpp
─────────────────                    ─────────────                      ─────────
chat UI, history in localStorage ──► POST /api/chat  ──► src/chat.js ──► SmolLM2
      ▲                                  │  SSE stream        │
      └──────── token chunks ────────────┘                    │
                                                              │
status indicator ◄── GET /api/status/stream ◄── src/model-manager.js
```

- **`server.js`** — Express server, SSE endpoints, graceful shutdown.
- **`src/models.js`** — the model catalog (one entry).
- **`src/model-manager.js`** — downloads, loads, and owns the single model + context instance.
- **`src/chat.js`** — builds a session per request from the conversation history, streams
  chunks, and rejects concurrent generations.
- **`public/`** — the browser UI. Plain HTML/CSS/JS, no build step.

Nothing in the browser talks to the model directly; it only calls this server.

### API

| Endpoint | Description |
|---|---|
| `GET /api/status` | Current model phase (`idle`/`downloading`/`loading`/`ready`/`error`) |
| `GET /api/status/stream` | The same, as a live SSE feed |
| `POST /api/model/load` | Start loading the model manually |
| `POST /api/chat` | Stream a reply. Body: `{messages, systemPrompt}` |
| `POST /api/chat/stop` | Stop the generation currently in flight |
| `GET /api/model/download` | Redirects to the GGUF file on Hugging Face |

`POST /api/chat` responds with server-sent events: `chunk` frames (`{text}`), then either
a `done` frame or an `error` frame. Aborting the request stops generation immediately.

## Troubleshooting

**The model download stalls or fails.** The built-in downloader pulls from Hugging Face.
You can fetch the file by hand instead:

```bash
curl -L -o models/smollm2-1.7b-instruct-q4_k_m.gguf \
  https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf
```

Place it in `models/` (or point `VOXELCHAT_MODEL_PATH` at it) and restart.

**`npm install` fails while building llama.cpp.** Prebuilt binaries cover macOS, Linux,
and Windows. If none match your platform, it builds from source with `cmake`, which needs
a working C++ toolchain.

**Replies are slow.** A 1.7B model on CPU is roughly 10–40 tokens/second depending on the
machine, so a long answer takes a while. `VOXELCHAT_MAX_TOKENS` caps reply length.

**Out of memory.** Close other applications, or use a smaller quant
(`Q4_K_S` is ~999 MB) by editing the entry in `src/models.js`.

**"This is a different model" on startup.** VoxelChat checks the size and parameter
count of whatever GGUF it loads. If the file is far too small to be SmolLM2 1.7B, it
refuses to run it, because a wrong model still loads and generates happily — it just
produces nonsense. Delete the file in `models/` and let it download again, or fix
`VOXELCHAT_MODEL_PATH`.

## Notes

- Conversations and the system prompt are saved in your browser's `localStorage`.
- The server binds to all interfaces so it can be reached from other devices on your
  network. It has **no authentication** — don't expose it to the public internet.
- This is a development server. For anything beyond personal use, add auth, rate
  limiting, and HTTPS.

## License

MIT
