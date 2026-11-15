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
your machine. You install it once, you start it once, and from then on you just
type. Everything – the model, the inference, the interface – lives on your
computer and works without an internet connection.

```bash
npm install
npm start
```

That is the whole setup. Your browser opens by itself and you are chatting.

> No `ollama pull`, no `huggingface-cli download`, no "now open PowerShell and
> paste this 200-character command". VoxelChat pre-caches the model for you and
> never asks you to touch a terminal again.

---

## What you get

| | |
| --- | --- |
| 🧠 **SmolLM2 1.7B Instruct** | The full 1.7B model (Apache-2.0), quantised to Q4_K_M so it runs happily on a laptop CPU. |
| ⚡ **Streaming replies** | Tokens appear as they are generated – with live tokens/second. |
| 🎭 **Six personas** | Helpful Assistant, Code Buddy, Creative Writer, Study Tutor, Summarizer, Devil's Advocate – plus your own system prompt. |
| 🎛️ **Real controls** | Temperature, top-p, max tokens, context size, theme. All persisted. |
| 🗂️ **Conversation history** | Multiple chats, stored in your browser, never uploaded. |
| 📴 **Fully offline** | After the one-time model cache, VoxelChat never talks to the network. |
| 🪶 **One small dependency tree** | `node-llama-cpp` ships prebuilt binaries – nothing is compiled on your machine. |

---

## Getting started

### 1. Install

```bash
npm install
```

`node-llama-cpp` downloads a prebuilt llama.cpp binary for your platform
(Windows, macOS, Linux – x64 or ARM64). No compiler, no Python, no CUDA
toolchain, no administrator rights.

### 2. Start

```bash
npm start
```

VoxelChat prints a small banner, opens your default browser at
`http://localhost:7842`, and is ready to talk.

### 3. Chat

Type in the composer. Press <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd>
for a new line, <kbd>Esc</kbd> to close panels.

That is the entire experience. If you already ran `npm install`, every future
launch is a single `npm start`.

---

## The model is pre-cached for you

VoxelChat keeps its models in the `models/` folder, right next to the app.

* **First launch only:** if `models/` is empty, VoxelChat downloads
  **SmolLM2 1.7B Instruct (Q4_K_M, ≈1.1 GB)** once, verifies its SHA-256
  checksum, and shows the progress right in the browser. There is nothing to
  confirm and nothing to run – just watch the bar.
* **Every launch after that:** the model is already on disk, so VoxelChat starts
  instantly and works with the network unplugged.
* **Your call:** drop any other `.gguf` file into `models/` and it shows up in
  the model picker automatically. The folder opens with the 📂 button in the
  sidebar.

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
* The only network request VoxelChat ever makes is the one-time model download
  into `models/`.

---

## Requirements

* **Node.js 20 or newer** (`node --version`)
* ~2 GB of free RAM for SmolLM2 1.7B (Q4_K_M)
* ~1.2 GB of disk for the model
* A GPU is used automatically when llama.cpp finds one — Metal on Apple
  silicon, CUDA or Vulkan on PC. Otherwise it runs happily on the CPU.

Prebuilt llama.cpp binaries ship for every common platform (Linux, macOS,
Windows – x64 and ARM64, with CUDA/Metal/Vulkan variants), so `npm install`
never compiles anything on your machine.

---

## Project layout

```
voxelchat/
├── src/
│   ├── launcher.js     # npm start – banner, browser launcher, boot sequence
│   ├── server.js       # Express + JSON/SSE API
│   ├── engine.js       # llama.cpp session, streaming, model swapping
│   ├── model-store.js  # model catalogue, cache, checksum-verified download
│   ├── settings.js     # persisted preferences
│   └── personas.js     # the built-in personas
├── public/             # the interface (vanilla HTML/CSS/JS, no build step)
├── scripts/            # api + ui smoke tests
├── models/             # your cached .gguf models (git-ignored)
└── data/               # your settings (git-ignored)
```

## Tests

```bash
npm test
```

Runs the API test (server endpoints) and the UI smoke test (the real front-end
in jsdom: boot → send → stream → persist).

## Licence

MIT for the app. SmolLM2 is Apache-2.0, © Hugging Face.
