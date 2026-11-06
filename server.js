import path from "node:path";
import {fileURLToPath} from "node:url";
import express from "express";
import {
    ensureModel,
    getStatus,
    subscribe,
    isReady,
    disposeModel
} from "./src/model-manager.js";
import {
    generateReply,
    normalizeMessages,
    normalizeSystemPrompt,
    isGenerating,
    waitForIdle,
    ChatBusyError,
    ChatValidationError,
    DEFAULT_SYSTEM_PROMPT
} from "./src/chat.js";
import {getModelInfo, ACTIVE_MODEL} from "./src/models.js";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const PORT = Number(process.env.PORT || 3000);
const AUTO_LOAD = process.env.VOXELCHAT_AUTO_LOAD !== "false";

const app = express();
app.use(express.json({limit: "1mb"}));

/**
 * Handle for the generation currently in flight, so a stop request can abort it
 * without waiting for the client connection to be noticed as closed.
 * @type {{abort: () => void} | null}
 */
let activeGeneration = null;
app.use(express.static(PUBLIC_DIR));

/* ---------------------------------- status --------------------------------- */

app.get("/api/status", (req, res) => {
    res.json({model: getModelInfo(), status: getStatus(), generating: isGenerating()});
});

/** Server-sent events feed so the UI can show download/load progress live. */
app.get("/api/status/stream", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    });

    const send = payload => res.write(`data: ${JSON.stringify(payload)}\n\n`);
    send({model: getModelInfo(), status: getStatus()});

    const unsubscribe = subscribe(status => send({model: getModelInfo(), status}));
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

    req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
});

/** Kick off loading manually (the server also does this on boot by default). */
app.post("/api/model/load", (req, res) => {
    if (isReady())
        return res.json({ok: true, status: getStatus()});

    ensureModel().catch(() => {
        // The failure is already reflected in the shared status object.
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
        // Make the browser wait for a pending download instead of failing outright.
        if (getStatus().phase === "downloading" || getStatus().phase === "loading" || getStatus().phase === "idle")
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

    // Halt generation when the browser disconnects.
    // `res` is used rather than `req`: with Express, `req`'s "close" can fire once the
    // request body has been read, which would abort generation immediately.
    res.on("close", () => {
        clientGone = true;
        if (!res.writableEnded) abort();
    });

    // Also halt it on an explicit POST /api/chat/stop. Stopping must not rely solely on
    // noticing a dropped connection, because that is unreliable across proxies, and a
    // request that is never read to completion can keep generating server-side.
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
            send("error", {
                error: isBusy ? error.message : "Generation failed.",
                details: error?.message ?? String(error)
            });
        }
    } finally {
        if (activeGeneration?.abort === abort) activeGeneration = null;
        res.end();
    }
});

/** Stop whatever is currently generating, if anything. Safe to call when idle. */
app.post("/api/chat/stop", (req, res) => {
    const wasGenerating = activeGeneration != null;
    activeGeneration?.abort();
    res.json({stopped: wasGenerating});
});

/* --------------------------------- download -------------------------------- */

/** Direct download of the GGUF file, for people who would rather not use the built-in downloader. */
app.get("/api/model/download", (req, res) => {
    res.redirect(302, ACTIVE_MODEL.url);
});

app.get("/api/system-prompt", (req, res) => {
    res.json({systemPrompt: DEFAULT_SYSTEM_PROMPT});
});

app.get("*", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

/* --------------------------------- lifecycle ------------------------------- */

const server = app.listen(PORT, () => {
    console.log("");
    console.log(`  VoxelChat  →  http://localhost:${PORT}`);
    console.log(`  Model      →  ${ACTIVE_MODEL.name} (${ACTIVE_MODEL.quantization})`);
    console.log("");

    if (AUTO_LOAD) {
        console.log("  Loading SmolLM2… the first run downloads about 1.06 GB.");
        ensureModel().catch(error => {
            console.error(`\n  Model failed to load: ${error?.message ?? error}`);
            console.error("  Fix the problem above, then reload the page to retry.\n");
        });
    } else {
        console.log("  VOXELCHAT_AUTO_LOAD=false — the model loads on your first message.");
    }
});

async function shutdown(signal) {
    console.log(`\n  ${signal} received — shutting down.`);

    server.close();

    // Stop any generation still in flight before the model is torn down. Disposing the
    // context underneath a running generation surfaces as a confusing "Object is disposed".
    activeGeneration?.abort();
    await waitForIdle({timeoutMs: 3000});
    await disposeModel();
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
