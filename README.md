# VoxelChat

A local AI chat app. Chat with **SmolLM2 1.7B Instruct** running entirely on your own
machine through [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp).

No API keys. No accounts. Nothing you type is sent to a third party.

> The name is just a name; there is no voxel rendering here.

## Requirements

- **Node.js 20 or newer**
- **~1.5 GB free disk space** for the model cache
- **~1.5 GB free RAM** (see [Memory use](#memory-use))
- Any modern browser

## Works on Windows, macOS and Linux

Every instruction here is shell-agnostic. This matters on Windows, where `cmd` and
PowerShell differ from bash in ways that quietly break copy-pasted commands:

- **Environment variables.** `PORT=8080 npm start` is bash-only. Use one of:

  ```
  npm start --port 8080
  ```

  or set the variable first. In PowerShell:

  ```
  $env:PORT=8080; npm start
  ```

  In cmd:

  ```
  set PORT=8080 && npm start
  ```

- **Downloading the model.** `npm run fetch` rather than a `curl` command, so no
  argument or line-continuation differences apply.

- **Clearing a broken install.** `rm -rf node_modules` is not available in PowerShell.
  Use:

  ```
  npm run clean
  ```

If a command anywhere in this README still assumes a POSIX shell, that is a bug — the
whole point is that none of them should.

## Quick start

```
npm install
npm start
```

Then open **http://localhost:3000**.

The first run caches SmolLM2 (~1.06 GB) and shows progress in the sidebar. Every run after
that loads straight from the cache — no download.

## How models are cached

Model files live in `cache/models/` and are treated as a **cache**, not as part of the app:

- Nothing is bundled or installed. A missing model is fetched automatically.
- Downloads go to a `.partial` file and are renamed into place only after the size and
  SHA-256 checksum verify. An interrupted download can therefore never leave a truncated
  `.gguf` that would later load as garbage.
- Once cached, a model is never downloaded again. `Settings → Unload` frees its RAM but
  keeps the file, so the next message reloads it from disk.
- Removing a file (`Settings → Remove`) only means it will be downloaded again later.

### Switching between models

Only SmolLM2 1.7B is in the catalog today; adding more is a config change (see below).
Switching uses **load-then-release**:

1. The new model is loaded while the current one keeps answering.
2. Only once the new model is ready is the old one released.

Doing it in the other order would mean a failed load leaves you with no model at all.
The tradeoff is that both are briefly resident, so a switch that would not fit in RAM is
refused up front with a clear message rather than ending in an out-of-memory crash. In
that case, unload first, then switch.

### Adding a model

Append an entry to `config/models.json` — no code changes needed:

```json
{
  "id": "smollm2-360m-instruct-q8_0",
  "name": "SmolLM2 360M Instruct",
  "parameters": "360M",
  "quantization": "Q8_0",
  "sizeBytes": 386000000,
  "minValidBytes": 300000000,
  "contextSize": 8192,
  "kvBytesPerToken": 49152,
  "url": "https://huggingface.co/.../resolve/main/model.gguf",
  "sha256": "optional-but-recommended"
}
```

`kvBytesPerToken` is only used to estimate whether a swap will fit in RAM. It is
`layers × kv_dim × 2 (K and V) × 2 bytes`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `VOXELCHAT_CACHE_DIR` | `./cache/models` | Where model files are cached |
| `VOXELCHAT_MODEL_PATH` | *(unset)* | Use a specific local `.gguf` instead of the default model |
| `VOXELCHAT_AUTO_LOAD` | `true` | Set to `false` to defer loading until the first message |
| `VOXELCHAT_CONTEXT_SIZE` | *auto* | Context window in tokens; by default the largest that fits RAM |
| `VOXELCHAT_MAX_TOKENS` | `512` | Maximum tokens generated per reply |

`PORT` can also be passed as a flag, which avoids environment-variable syntax entirely:
`npm start -- --port 8080`. For the others, see the shell notes at the top.

## Memory use

Weights are ~1.06 GB. The KV cache grows with the context window — for SmolLM2 1.7B it
costs roughly **192 KB per token**:

| Context window | KV cache | Weights + KV |
|---|---|---|
| 512 | 96 MB | ~1.16 GB |
| 1024 | 192 MB | ~1.25 GB |
| 2048 | 384 MB | ~1.44 GB |
| 4096 | 768 MB | ~1.83 GB |

At startup VoxelChat measures free RAM and picks the largest context that fits, so a 2 GB
machine gets a smaller window instead of failing to allocate. The chosen size is logged
and shown in Settings.

Note that the model file must exist on disk: `node-llama-cpp` loads models by path
(memory-mapped) and has no API for loading weights from a RAM buffer.

## API

| Endpoint | Description |
|---|---|
| `GET /api/status` | Model list, active model, phase, generating flag |
| `GET /api/status/stream` | The same, as a live SSE feed |
| `GET /api/models` | Catalog with `cached` / `active` flags |
| `POST /api/models/switch` | Switch models. Body: `{id}` |
| `POST /api/models/install` | Cache a model without loading it. Body: `{id}` |
| `POST /api/models/uninstall` | Delete a cached file. Body: `{id}` |
| `POST /api/models/unload` | Release the loaded model from RAM |
| `POST /api/chat` | Stream a reply. Body: `{messages, systemPrompt}` |
| `POST /api/chat/stop` | Stop the generation in flight |

`POST /api/chat` responds with server-sent events: `chunk` frames (`{text}`), then a
`done` or `error` frame.

## Troubleshooting

Run this first — it checks Node, memory, the install, the network, and the cache:

```bash
npm run doctor
```

### The model download fails

The download comes from Hugging Face. Retry it on its own with:

```
npm run fetch
```

That works the same in PowerShell, cmd, Git Bash, zsh and bash — there is no shell-specific
download command to get right. If the network blocks it entirely, open the direct link
printed by that command in a browser and save the file to the path it shows (usually
`cache/models/`). Then `npm start`; it will be picked up from the cache.

### "The downloaded file is only X MB"

The server returned an error page instead of the model (usually a redirect or a captive
portal). The file is discarded rather than cached, so retrying is safe.

### "This is a different model"

VoxelChat checks a file's size before using it. A wrong `.gguf` still loads and generates
without error — it just produces nonsense — so this fails loudly instead.

### `npm install` fails

`node-llama-cpp` ships prebuilt binaries for Windows x64/arm64, macOS (Intel and Apple
Silicon), and Linux x64/arm64. The usual causes:

1. **Node.js is too old.** `node -v` must report 20 or newer. This is the most common
   cause, and npm reports it as an `EBADENGINE` warning buried in a dependency error.
2. **No prebuilt binary for your platform.** npm then builds llama.cpp from source, which
   needs `cmake` and a C++ toolchain. On Windows that means Visual Studio Build Tools with
   the "Desktop development with C++" workload. Fetch a prebuilt binary instead with:

   ```
   npx --no-install node-llama-cpp source download
   ```

3. **A proxy or firewall blocks `registry.npmjs.org`.**
4. **A stale lockfile or partial `node_modules`.** Clear it and retry:

   ```
   npm run clean
   npm install
   ```

npm prints the real error *above* its own summary — read the first `ERR!` block, not the
last line.

### Replies are slow

A 1.7B model on CPU runs at roughly 10–40 tokens/second. `VOXELCHAT_MAX_TOKENS` caps reply
length.

## Notes

- Conversations and the system prompt are saved in your browser's `localStorage`.
- The server binds all interfaces, has no authentication, and is a development server.
  Don't expose it to the public internet.

## License

MIT
