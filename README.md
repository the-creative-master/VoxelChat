# 🧊 VoxelChat

**Just open the link and chat with AI. That's the whole instruction.**

## 🌐 Use it now — GitHub Pages

**https://the-creative-master.github.io/VoxelChat/**

Open it, wait a few seconds the first time while the AI arrives in your tab, and type. No install. No account. No API key. No files to download, cache, or configure — for you or anyone you share the link with.

VoxelChat runs a real AI model (**SmolLM2 1.7B**) entirely **inside your browser** using llama.cpp compiled to WebAssembly ([@wllama/wllama](https://github.com/ngxson/wllama)). The first visit automatically loads the model into your browser's cache; every visit after that opens instantly and even works offline. Nothing you type ever leaves your device.

> Publishing: pushing to this repo runs *Actions → Publish VoxelChat to GitHub Pages*, which deploys the static site in `pages/`. The Node.js local-server version below is kept for offline desktop use.

---

## 🖥️ Optional: run it as a local desktop app

```bash
npm start
```

Then open **http://localhost:3000** and chat.

That's it. VoxelChat automatically installs its one dependency (`node-llama-cpp`) for you — and that's the only installing that ever happens.

**The AI model is never downloaded at runtime.** VoxelChat runs **SmolLM2 1.7B Instruct** (Q4_K_M, ~1.1 GB, Apache-2.0) straight from a local cache in `models/`. The model is already cached for this project in the **[`model-cache-v1` release](../../releases/tag/model-cache-v1)** — put `smollm2-1.7b-instruct-q4_k_m.gguf` in `models/` (or run `npm run cache-model` once) and never think about it again. From then on VoxelChat is **fully offline**, forever. Your conversations never leave your machine, and chat history is kept only in your browser.

> You need [Node.js](https://nodejs.org) 18+ — that's the only prerequisite, and it's what runs the app itself.

## ✨ Features

- 💬 Clean, streaming chat interface (tokens appear as they're generated)
- ⏹️ Stop generation, ➕ new chat, 💾 history saved in your browser
- 📊 Live status: watch the one-time model download, then "Ready · offline"
- 🔒 Private by design — no keys, no servers, no tracking
- 🧠 Real local LLM inference via [node-llama-cpp](https://node-llama-cpp.withcat.ai/) (llama.cpp)

## 🔧 Optional tweaks (all optional, via environment variables)

| Variable | What it does |
|---|---|
| `PORT` | Port to serve on (default `3000`) |
| `MODEL_PATH` | Path to a specific `.gguf` model to use |
| `SYSTEM_PROMPT` | Custom personality/instructions for the assistant |

**Want a smarter model?** Drop any `.gguf` file into the `models/` folder and restart — VoxelChat will use it automatically (bigger models need more RAM and answer more slowly).

## 📁 Project layout

```
start.mjs          ← launcher: auto-installs deps, then boots the server
server.mjs         ← local server + node-llama-cpp model engine (built-in Node http, no framework)
public/            ← the chat interface (index.html, styles.css, app.js)
models/            ← the cached SmolLM2 1.7B model lives here (loaded from disk, never downloaded at runtime)
```
