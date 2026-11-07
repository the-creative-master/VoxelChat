import path from "node:path";
import {fileURLToPath} from "node:url";
import express from "express";
import {
    ensureModel,
    loadModel,
    installModel,
    uninstallModel,
    unloadModel,
    getStatus,
    getActiveModelId,
    isReady,
    subscribe,
    onModelChange,
    disposeAll
} from "./src/model-manager.js";
import {MODELS, DEFAULT_MODEL_ID, getModel, toPublicModel, formatBytes} from "./src/catalog.js";
import {cacheUsageBytes} from "./src/cache.js";
import {
    generateReply,
    normalizeMessages,
    normalizeSystemPrompt,
    isGenerating,
    abortActiveGeneration,
    waitForIdle,
    ChatBusyError,
    ChatValidationError,
    DEFAULT_SYSTEM_PROMPT
} from "./src/chat.js";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
/**
 * Resolve a port from --port <n> / --port=<n> or the PORT variable.
 * The flag exists because `PORT=8080 npm start` is bash-only syntax; `npm start -- --port 8080`
 * works identically in PowerShell, cmd and every POSIX shell.
 */
function resolvePort() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--port" || arg === "-p") {
            const value = Number(args[i + 1]);
            if (Number.isFinite(value) && value > 0) return value;
        } else if (arg.startsWith("--port=")) {
            const value = Number(arg.slice("--port=".length));
            if (Number.isFinite(value) && value > 0) return value;
        }
    }

    const fromEnv = Number(process.env.PORT);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 3000;
}

const PORT = resolvePort();
const AUTO_LOAD = process.env.VOXELCHAT_AUTO_LOAD !== "false";

const app = express();
app.use(express.json({limit: "1mb"}));
app.use(express.static(PUBLIC_DIR));

/** Handle for the generation currently in flight. */
let activeGeneration = null;

/* ---------------------------------- models --------------------------------- */

function modelList() {
    const activeId = getActiveModelId();
    return MODELS.map(model => toPublicModel(model, {active: model.id === activeId}));
}

app.get("/api/models", (req, res) => {
    res.json({
        models: modelList(),
        defaultModelId: DEFAULT_MODEL_ID,
        activeModelId: getActiveModelId(),
        cacheBytes: cacheUsageBytes(),
        cacheBytesLabel: formatBytes(cacheUsageBytes())
    });
});

app.get("/api/status", (req, res) => {
    res.json({
        models: modelList(),
        defaultModelId: DEFAULT_MODEL_ID,
        activeModelId: getActiveModelId(),
        status: getStatus(),
        generating: isGenerating()
    });
});

/** Live feed of download/load/swap progress. */
app.get("/api/status/stream", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    });

    const payload = () => ({
        models: modelList(),
        activeModelId: getActiveModelId(),
        status: getStatus()
    });

    const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send(payload());

    const unsubscribeStatus = subscribe(() => send(payload()));
    const unsubscribeChange = onModelChange(() => send(payload()));
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

    req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribeStatus();
        unsubscribeChange();
    });
});

/**
 * Switch models. The incoming model is loaded before the outgoing one is released, so a
 * failed switch leaves the previous model in place rather than nothing at all.
 */
app.post("/api/models/switch", async (req, res) => {
    const id = req.body?.id;
    if (typeof id !== "string" || getModel(id) == null)
        return res.status(400).json({error: "Unknown model id."});

    try {
        // Stop answering before the context is replaced underneath us.
        activeGeneration?.abort();
        abortActiveGeneration();
        await waitForIdle({timeoutMs: 5000});

        await loadModel(id);
        res.json({ok: true, activeModelId: getActiveModelId(), status: getStatus()});
    } catch (error) {
        res.status(500).json({error: error?.message ?? String(error)});
    }
});

/** Cache a model's file without loading it. */
app.post("/api/models/install", async (req, res) => {
    const id = req.body?.id;
    if (typeof id !== "string" || getModel(id) == null)
        return res.status(400).json({error: "Unknown model id."});

    try {
        await installModel(id);
        res.json({ok: true, models: modelList()});
    } catch (error) {
        res.status(500).json({error: error?.message ?? String(error)});
    }
});

/** Delete a cached model file. Refuses while it is loaded. */
app.post("/api/models/uninstall", async (req, res) => {
    const id = req.body?.id;
    if (typeof id !== "string" || getModel(id) == null)
        return res.status(400).json({error: "Unknown model id."});

    try {
        await uninstallModel(id);
        res.json({ok: true, models: modelList(), cacheBytesLabel: formatBytes(cacheUsageBytes())});
    } catch (error) {
        res.status(409).json({error: error?.message ?? String(error)});
    }
});

/** Release the loaded model from RAM. The next message reloads it from the cache. */
app.post("/api/models/unload", async (req, res) => {
    try {
        activeGeneration?.abort();
        abortActiveGeneration();
        await waitForIdle({timeoutMs: 5000});

        const result = await unloadModel();
        res.json({ok: true, ...result, status: getStatus()});
    } catch (error) {
        res.status(500).json({error: error?.message ?? String(error)});
    }
});

/** Kick off loading without blocking. */
app.post("/api/model/load", (req, res) => {
    if (isReady()) return res.json({ok: true, status: getStatus()});

    ensureModel().catch(() => {
        // Failure is already reflected in the shared status.
    });

    res.status(202).json({ok: true, status: getStatus()});
});

/* ----------------------------------- chat ---------------------------------- */

app.post("/api/chat", async (req, res) => {
    let messages;
    let systemPrompt;

    try {
        messages = normalizeMessages(req.body?.messages);
        systemPrompt = normalizeSystemPrompt(req.body?.systemPrompt);
    } catch (error) {
        if (error instanceof ChatValidationError)
            return res.status(400).json({error: error.message});
        throw error;
    }

    if (!isReady()) {
        const phase = getStatus().phase;
        if (phase === "idle" || phase === "downloading" || phase === "loading")
            ensureModel().catch(() => {});
    }

    try {
        await ensureModel();
    } catch (error) {
        return res.status(503).json({
            error: "The model could not be loaded.",
            details: error?.message ?? String(error)
        });
    }

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    });

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const abortController = new AbortController();
    const abort = () => abortController.abort();
    let clientGone = false;

    res.on("close", () => {
        clientGone = true;
        if (!res.writableEnded) abort();
    });

    activeGeneration = {abort};
    const startedAt = Date.now();

    try {
        const {text, stopReason} = await generateReply({
            messages,
            systemPrompt,
            signal: abortController.signal,
            onTextChunk(chunk) {
                if (clientGone) return;
                send("chunk", {text: chunk});
            }
        });

        if (!clientGone) {
            send("done", {
                stopReason,
                durationMs: Date.now() - startedAt,
                characters: text.length
            });
        }
    } catch (error) {
        if (!clientGone) {
            const isBusy = error instanceof ChatBusyError;
            const isValidation = error instanceof ChatValidationError;
            send("error", {
                error: isBusy || isValidation ? error.message : "Generation failed.",
                details: error?.message ?? String(error)
            });
        }
    } finally {
        if (activeGeneration?.abort === abort) activeGeneration = null;
        res.end();
    }
});

/** Stop whatever is currently generating. Safe to call when idle. */
app.post("/api/chat/stop", (req, res) => {
    const wasGenerating = activeGeneration != null;
    activeGeneration?.abort();
    abortActiveGeneration();
    res.json({stopped: wasGenerating});
});

/* --------------------------------- misc ------------------------------------ */

app.get("/api/system-prompt", (req, res) => {
    res.json({systemPrompt: DEFAULT_SYSTEM_PROMPT});
});

/** Direct download link, for people who would rather fetch the file themselves. */
app.get("/api/models/:id/download", (req, res) => {
    const model = getModel(req.params.id);
    if (model == null) return res.status(404).json({error: "Unknown model id."});
    res.redirect(302, model.url);
});

app.get("*", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

/* -------------------------------- lifecycle -------------------------------- */

const server = app.listen(PORT, () => {
    console.log("");
    console.log(`  VoxelChat  →  http://localhost:${PORT}`);

    const defaultModel = getModel(DEFAULT_MODEL_ID);
    console.log(`  Model      →  ${defaultModel?.name ?? DEFAULT_MODEL_ID} (${defaultModel?.quantization ?? "?"})`);
    console.log("");

    if (AUTO_LOAD) {
        ensureModel().catch(error => {
            console.error(`\n  Model failed to load: ${error?.message ?? error}\n`);
        });
    } else {
        console.log("  VOXELCHAT_AUTO_LOAD=false — the model loads on your first message.");
    }
});

async function shutdown(signal) {
    console.log(`\n  ${signal} received — shutting down.`);

    server.close();

    // Stop generation before the model is torn down, otherwise it surfaces as
    // "Object is disposed" mid-stream.
    activeGeneration?.abort();
    abortActiveGeneration();
    await waitForIdle({timeoutMs: 3000});
    await disposeAll();
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
