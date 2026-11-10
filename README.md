# 🧊 VoxelChat

**Just an AI chatting interface — running 100% locally on your computer.**
No accounts. No API keys. No cloud. Nothing to install.

![Built with node-llama-cpp](https://img.shields.io/badge/AI-node--llama.cpp-green)

## ▶️ The only step

```bash
npm start
```

Then open **http://localhost:3000** and chat.

That's it. On the first launch VoxelChat automatically:

1. Installs its one dependency (`node-llama-cpp`) for you,
2. Downloads a small open AI model once (~400 MB, Qwen2.5 0.5B Instruct),
3. Loads it and starts chatting.

After that first download, VoxelChat works **fully offline**, forever. Your conversations never leave your machine, and chat history is kept only in your browser.

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
| `MODEL_URI` | URL/URI of a model to auto-download instead of the default |
| `SYSTEM_PROMPT` | Custom personality/instructions for the assistant |

**Want a smarter model?** Drop any `.gguf` file into the `models/` folder and restart — VoxelChat will use it automatically (bigger models need more RAM and answer more slowly).

## 📁 Project layout

```
start.mjs          ← launcher: auto-installs deps, then boots the server
server.mjs         ← local server + node-llama-cpp model engine (built-in Node http, no framework)
public/            ← the chat interface (index.html, styles.css, app.js)
models/            ← the AI model lives here (auto-downloaded, git-ignored)
```
