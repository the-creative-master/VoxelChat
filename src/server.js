/**
 * VoxelChat local server.
 *
 * Serves the chat UI and exposes a tiny JSON/SSE API around the local
 * llama.cpp engine. Everything happens on this machine – there is no cloud
 * component, no account and no API key anywhere in this file.
 */
import {spawn} from "node:child_process";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {VoxelEngine} from "./engine.js";
import {formatBytes, listLocalModels, MODEL_CATALOG} from "./model-store.js";
import {PERSONAS} from "./personas.js";
import {SettingsStore} from "./settings.js";
import {VERSION} from "./version.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const publicDir = path.join(projectRoot, "public");
const modelsDir = path.join(projectRoot, "models");
const dataDir = path.join(projectRoot, "data");

export async function createServer({
    port = 7842,
    host = "0.0.0.0",
    openBrowser = false,
    quiet = false,
    dataDir: dataDirOverride = dataDir,
    modelsDir: modelsDirOverride = modelsDir,
} = {}) {
    const settingsStore = new SettingsStore(dataDirOverride);
    await settingsStore.load();

    const engine = new VoxelEngine({modelsDir: modelsDirOverride, settings: settingsStore.settings});
    const app = express();

    app.use(express.json({limit: "5mb"}));

    // The API is never cached: a stale answer (or a 304 with an empty body)
    // must never be what the app works with.
    app.use("/api", (_request, response, next) => {
        response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("Expires", "0");

        next();
    });

    // A one line trace of every request – the fastest way to see what a
    // browser (or a proxy in front of it) is actually asking for.
    app.use((request, response, next) => {
        const startedAt = Date.now();

        response.on("finish", () => {
            if (quiet) return;

            const elapsed = Date.now() - startedAt;

            console.log(
                `  ${request.method} ${request.originalUrl} → ${response.statusCode} ${elapsed}ms` +
                    ` ${request.get("user-agent") ?? ""}`,
            );
        });

        next();
    });

    app.use(express.static(publicDir, {extensions: ["html"]}));

    const statusClients = new Set();

    const broadcast = (status) => {
        const payload = `data: ${JSON.stringify(status)}\n\n`;

        for (const client of statusClients) {
            try {
                client.write(payload);
            } catch {
                statusClients.delete(client);
            }
        }
    };

    engine.on("status", broadcast);
    engine.on("log", (message) => console.log(`  ${message}`));

    app.get("/api/status", (_request, response) => {
        response.json({...engine.status, version: VERSION});
    });

    app.get("/api/events", (request, response) => {
        response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });
        response.flushHeaders?.();
        response.write(`data: ${JSON.stringify({...engine.status, version: VERSION})}\n\n`);
        statusClients.add(response);

        const keepAlive = setInterval(() => {
            try {
                response.write(": ping\n\n");
            } catch {
                /* closed */
            }
        }, 25_000);

        request.on("close", () => {
            clearInterval(keepAlive);
            statusClients.delete(response);
        });
    });

    app.get("/api/personas", (_request, response) => {
        response.json({personas: PERSONAS});
    });

    app.get("/api/models", async (_request, response) => {
        const localModels = await listLocalModels(modelsDirOverride);

        response.json({
            catalog: MODEL_CATALOG.map((entry) => ({
                id: entry.id,
                label: entry.label,
                shortLabel: entry.shortLabel,
                params: entry.params,
                quant: entry.quant,
                sizeBytes: entry.approxBytes,
                sizeLabel: formatBytes(entry.approxBytes),
                recommended: Boolean(entry.recommended),
                cached: localModels.some((model) => model.id === entry.id),
            })),
            local: localModels.map((model) => ({
                id: model.id,
                label: model.label,
                params: model.params,
                quant: model.quant,
                sizeBytes: model.sizeBytes,
                sizeLabel: formatBytes(model.sizeBytes),
                fileName: model.fileName,
                recommended: model.recommended,
            })),
            active: engine.activeModel?.id ?? null,
            modelsDir: modelsDirOverride,
        });
    });

    app.post("/api/models/activate", async (request, response) => {
        try {
            const {modelId} = request.body ?? {};
            const localModels = await listLocalModels(modelsDirOverride);
            const target = localModels.find((model) => model.id === modelId || model.path === modelId);

            if (!target) {
                response.status(404).json({error: "That model is not in the VoxelChat model store."});
                return;
            }

            await settingsStore.save({preferredModelId: target.id});
            engine.settings = settingsStore.settings;
            await engine.swapModel(target);

            response.json(engine.status);
        } catch (error) {
            response.status(500).json({error: error.message});
        }
    });

    app.get("/api/settings", (_request, response) => {
        response.json(settingsStore.settings);
    });

    app.post("/api/settings", async (request, response) => {
        const allowed = ["personaId", "systemPrompt", "temperature", "topP", "maxTokens", "contextSize", "threads", "gpu", "preferredModelId", "theme"];
        const patch = {};

        for (const key of allowed) {
            if (request.body?.[key] !== undefined) patch[key] = request.body[key];
        }

        const next = await settingsStore.save(patch);
        engine.settings = next;

        if (patch.contextSize !== undefined) {
            engine.setContextSize(patch.contextSize).catch((error) => {
                console.error(`  Could not resize the context: ${error.message}`);
            });
        }

        response.json(next);
    });

    app.post("/api/chat", async (request, response) => {
        const {messages = [], stream = true} = request.body ?? {};

        if (!Array.isArray(messages) || messages.length === 0) {
            response.status(400).json({error: "A message is required."});
            return;
        }

        if (!engine.session) {
            response.status(503).json({error: engine.error ?? "The model is still loading."});
            return;
        }

        if (!stream) {
            try {
                const result = await engine.chat({messages});

                response.json(result);
            } catch (error) {
                response.status(500).json({error: error.message});
            }

            return;
        }

        response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        });

        // Flush the headers and send an empty frame: some proxies hold a
        // response back until the first byte arrives.
        response.flushHeaders?.();
        response.write(": connected\n\n");

        const send = (event, data) => {
            response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const controller = new AbortController();

        // `response.close` fires when the client goes away (request.close fires as
        // soon as the request body has been read, which is far too early here).
        response.on("close", () => {
            if (!response.writableEnded) {
                controller.abort();
            }
        });

        try {
            await engine.chat({
                messages,
                signal: controller.signal,
                onDelta: (chunk) => send("delta", {text: chunk}),
                onDone: (payload) => send("done", payload),
            });
        } catch (error) {
            if (!controller.signal.aborted) {
                send("error", {message: error.message});
            }
        } finally {
            response.end();
        }
    });

    app.post("/api/chat/stop", (_request, response) => {
        engine.abortController?.abort();
        response.json({stopped: true});
    });

    app.post("/api/boot", (_request, response) => {
        if (engine.busy || engine.phase === "loading") {
            response.json({started: false, status: engine.status});
            return;
        }

        response.json({started: true});

        engine.boot().catch((error) => {
            console.error(`  Model boot failed: ${error.message}`);
        });
    });

    app.post("/api/models/folder/open", async (_request, response) => {
        try {
            await fs.mkdir(modelsDirOverride, {recursive: true});

            const opener = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
            const child = spawn(opener, [modelsDirOverride], {detached: true, stdio: "ignore"});

            child.unref();
            response.json({opened: true, modelsDir: modelsDirOverride});
        } catch (error) {
            response.status(500).json({error: error.message});
        }
    });

    app.get("*", (_request, response) => {
        response.sendFile(path.join(publicDir, "index.html"));
    });

    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(port, host, () => resolve(instance));
        instance.on("error", reject);
    });

    const actualPort = server.address().port;

    return {
        app,
        server,
        engine,
        port: actualPort,
        url: `http://localhost:${actualPort}`,
        modelsDir: modelsDirOverride,
        dataDir: dataDirOverride,
        async close() {
            for (const client of statusClients) {
                try {
                    client.end();
                } catch {
                    /* ignore */
                }
            }

            await new Promise((resolve) => server.close(resolve));
            await engine.dispose();
        },
    };
}
