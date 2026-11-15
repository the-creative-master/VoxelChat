<div align="center">

# ▛▀▖▛ VoxelChat

**Chat with SmolLM2 1.7B on your own machine.**
No cloud. No API key. No account. No setup.

![node](https://img.shields.io/badge/node-%E2%89%A520-informational?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-informational?style=flat-square)
![offline](https://img.shields.io/badge/model-100%25%20local-6bcb77?style=flat-square)

</div>

---

## The idea

VoxelChat is a chat app for people who do not want to *configure* a chat app.

It runs **SmolLM2 1.7B Instruct** through **llama.cpp** (via
[`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp)) directly on
your machine. The model ships **inside** the app – already downloaded, already
verified, already in place. You unpack it, double-click it, and you are
chatting. Everything – the weights, the inference, the interface – lives on
your computer and works with the network unplugged.

> No `ollama pull`, no `huggingface-cli download`, no "now open PowerShell and
> paste this 200-character command", no `npm install`, no first-run download
> bar. VoxelChat never reaches for the internet while you use it.

---

## Getting started

### The normal way (no setup at all)

1. Download the folder for your platform from
   [**Releases → VoxelChat 2.0**](https://github.com/the-creative-master/VoxelChat/releases/tag/voxelchat-v2).
2. Unpack it.
3. Double-click **VoxelChat** (macOS / Linux) or **VoxelChat.cmd** (Windows).
4. Your browser opens at `http://localhost:7842` and you are chatting.

| Platform | Download |
| --- | --- |
| Windows (x64) | [`VoxelChat-win-x64.zip`](https://github.com/the-creative-master/VoxelChat/releases/download/voxelchat-v2/VoxelChat-win-x64.zip) |
| macOS (Apple Silicon) | [`VoxelChat-darwin-arm64.tar.gz`](https://github.com/the-creative-master/VoxelChat/releases/download/voxelchat-v2/VoxelChat-darwin-arm64.tar.gz) |
| macOS (Intel) | [`VoxelChat-darwin-x64.tar.gz`](https://github.com/the-creative-master/VoxelChat/releases/download/voxelchat-v2/VoxelChat-darwin-x64.tar.gz) |
| Linux (x64) | [`VoxelChat-linux-x64.tar.gz`](https://github.com/the-creative-master/VoxelChat/releases/download/voxelchat-v2/VoxelChat-linux-x64.tar.gz) |

The folder already contains everything:

```
VoxelChat-linux-x64/
├── VoxelChat            ← double-click this
├── VoxelChat.cmd        ← double-click this on Windows
├── runtime/node         ← its own Node runtime, already there
├── models/              ← SmolLM2 1.7B Instruct, already there
├── node_modules/        ← llama.cpp, prebuilt, already there
└── src/, public/        ← the app
```

### For developers (from source)

```bash
npm install
npm run prepare-model   # only if models/ is empty
npm start
```

`npm install` pulls the prebuilt llama.cpp binary for your platform – no
compiler, no Python, no CUDA toolchain, no administrator rights.

---

## What you get

| | |
| --- | --- |
| 🧠 **SmolLM2 1.7B Instruct** | The full 1.7B model (Apache-2.0), quantised to Q4_K_M so it runs happily on a laptop CPU. |
| 📦 **The model is included** | 1.05 GB of weights travel with the app – nothing is ever downloaded while you use it. |
| ⚡ **Streaming replies** | Tokens appear as they are generated – with live tokens/second. |
| 🎭 **Six personas** | Helpful Assistant, Code Buddy, Creative Writer, Study Tutor, Summarizer, Devil's Advocate – plus your own system prompt. |
| 🎛️ **Real controls** | Temperature, top-p, max tokens, context size, threads, theme. All persisted. |
| 🗂️ **Conversation history** | Multiple chats, stored in your browser, never uploaded. |
| 📴 **Fully offline** | VoxelChat makes no network requests at all while you chat. |
| 🪶 **Prebuilt engine** | llama.cpp ships as a binary for every common platform – nothing is compiled on your machine. |

---

## The model is pre-bundled, never fetched

VoxelChat keeps its models in the `models/` folder, right next to the app.

* **Every launch:** the weights are already on disk, checksum-verified and
  ready. VoxelChat starts instantly and works with the network unplugged.
* **No runtime download:** the app contains no downloader. There is no first-run
  progress bar, because there is nothing to fetch.
* **Your call:** drop any other `.gguf` file into `models/` and it shows up in
  the model picker automatically. The folder opens with the 📂 button in the
  sidebar.

The weights come from
[`HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF`](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF)
(revision `2d4a76a3`, file `smollm2-1.7b-instruct-q4_k_m.gguf`), SHA-256
`decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33`.
SmolLM2 is trained by [Hugging Face](https://huggingface.co/HuggingFaceTB) and
released under the Apache-2.0 licence.

---

## Using it

### Personas

A persona is just a system prompt. Pick one from the composer chip or the
settings drawer:

* 🧭 **Helpful Assistant** – balanced and clear
* 🛠️ **Code Buddy** – practical code and trade-offs
* ✍️ **Creative Writer** – vivid prose and brainstorming
* 🎓 **Study Tutor** – explains step by step
* 📌 **Summarizer** – distils into bullet points
* 🧨 **Devil's Advocate** – pushes back, politely

Write your own in **Settings → Custom system prompt**.

### Generation controls

| Setting | Default | What it does |
| --- | --- | --- |
| Temperature | `0.7` | Lower is more focused, higher is more creative. |
| Top-p | `0.9` | Nucleus sampling cutoff. |
| Max new tokens | `512` | Upper bound for a single reply. |
| Context size | `4096` | How much conversation the model can remember. |
| Threads | `auto` | CPU threads for llama.cpp. `auto` follows how many CPUs you really have. |

### Keyboard

| Key | Action |
| --- | --- |
| <kbd>Enter</kbd> | Send the message |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | New line |
| <kbd>Esc</kbd> | Close the settings drawer / sidebar |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> | Copy the reply (from the message actions) |

---

## Privacy

* The model runs in-process. **Your prompts never leave your machine.**
* No telemetry, no analytics, no accounts, no API keys.
* Conversations and settings live in `localStorage` (browser) and
  `data/settings.json` (disk).
* **VoxelChat makes no network requests while you use it.** The model is
  already on disk; nothing else is fetched, ever.

---

## Requirements

* **Nothing to install** in the packaged app – it carries its own Node runtime
  and its own prebuilt llama.cpp binaries.
* ~2 GB of free RAM for SmolLM2 1.7B (Q4_K_M)
* ~1.2 GB of disk for the app folder (the model is 1.05 GB of it)
* A GPU is used automatically when llama.cpp finds one — Metal on Apple
  silicon, CUDA or Vulkan on PC. Otherwise it runs happily on the CPU.

Building from source needs **Node.js 20 or newer** (`node --version`).
Prebuilt llama.cpp binaries ship for every common platform (Linux, macOS,
Windows – x64 and ARM64, with CUDA/Metal/Vulkan variants).

---

## Project layout

```
voxelchat/
├── src/
│   ├── launcher.js     # npm start – banner, browser launcher, boot sequence
│   ├── server.js       # Express + JSON/SSE API
│   ├── engine.js       # llama.cpp session, streaming, model swapping
│   ├── model-store.js  # model catalogue + what is on disk
│   ├── settings.js     # persisted preferences
│   └── personas.js     # the built-in personas
├── public/             # the interface (vanilla HTML/CSS/JS, no build step)
├── scripts/            # app builder, model preparer, api + ui smoke tests
├── models/             # the bundled .gguf models (git-ignored)
├── data/               # your settings (git-ignored)
└── dist/               # the packaged app folders (git-ignored)
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start VoxelChat and open your browser. |
| `npm run build:app` | Build a self-contained app folder in `dist/` (add `-- --platform all` for every platform). |
| `npm run prepare-model` | Put the model into `models/` – for a fresh checkout or CI. |
| `npm run verify-model` | Check the model's checksum and ask it a question. |
| `npm test` | API test + front-end smoke test. |

---

## Tests

```bash
npm test
```

Runs the API test (server endpoints) and the UI smoke test (the real front-end
in jsdom: boot → send → stream → persist).

---

## Licence

MIT for the app. SmolLM2 is Apache-2.0, © Hugging Face.
