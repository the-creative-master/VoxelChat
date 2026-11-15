/**
 * VoxelChat inference engine.
 *
 * Wraps node-llama-cpp (llama.cpp) in a small, friendly surface:
 *  - boot()      : initialises llama.cpp and loads the active model
 *  - chat()      : streams a reply for a conversation
 *  - swapModel() : hot-swaps the active GGUF without restarting the app
 */
import {EventEmitter} from "node:events";
import os from "node:os";
import {getLlama, LlamaChatSession} from "node-llama-cpp";

import {chooseModel, downloadCatalogModel, listLocalModels, MODEL_CATALOG} from "./model-store.js";

const LLAMA_CONTEXT_DEFAULT = 4096;

/**
 * How many CPU threads llama.cpp should use.
 *
 * llama.cpp's own default is based on the raw hardware thread count, which is
 * wrong inside containers and VMs where the process is pinned to a fraction of
 * the host's CPUs: the extra threads spin-wait on each other and generation
 * collapses (we measured 0.16 tok/s instead of 71 tok/s on a 2-core slice).
 * `os.availableParallelism()` respects cgroup/affinity limits, so we cap it.
 */
export function resolveThreadCount(override) {
    if (Number.isFinite(override) && override > 0) {
        return Math.max(1, Math.min(Math.floor(override), 64));
    }

    const available = os.availableParallelism?.() ?? os.cpus().length ?? 4;

    return Math.max(1, Math.min(available, 8));
}

export class VoxelEngine extends EventEmitter {
    constructor({modelsDir, settings}) {
        super();

        this.modelsDir = modelsDir;
        this.settings = settings;
        this.llama = null;
        this.model = null;
        this.context = null;
        this.sequence = null;
        this.session = null;
        this.activeModel = null;
        this.abortController = null;
        this.busy = false;
        this.phase = "idle";
        this.stage = "Waiting to start";
        this.progress = 0;
        this.error = null;
        this.threadCount = resolveThreadCount(settings?.threads);
    }

    get status() {
        return {
            phase: this.phase,
            stage: this.stage,
            progress: this.progress,
            error: this.error,
            busy: this.busy,
            device: this.deviceLabel,
            systemInfo: this.llama?.systemInfo ?? null,
            model: this.activeModel
                ? {
                    id: this.activeModel.id,
                    label: this.activeModel.label,
                    params: this.activeModel.params,
                    quant: this.activeModel.quant,
                    fileName: this.activeModel.fileName,
                    sizeBytes: this.activeModel.sizeBytes,
                    path: this.activeModel.path,
                }
                : null,
            contextSize: this.sequence?.contextSize ?? this.settings.contextSize,
            threads: this.threadCount,
        };
    }

    get deviceLabel() {
        if (!this.llama) return "CPU";

        const gpu = this.llama.gpu;

        if (!gpu || gpu === "false") return "CPU";

        return typeof gpu === "string" ? gpu.toUpperCase() : "GPU";
    }

    setStatus(phase, stage, progress = this.progress) {
        this.phase = phase;
        this.stage = stage;
        this.progress = progress;
        this.emit("status", this.status);
    }

    /**
     * Boots the engine: makes sure a model exists, then loads it.
     */
    async boot() {
        try {
            this.error = null;
            this.setStatus("booting", "Starting llama.cpp", 0);

            const localModels = await listLocalModels(this.modelsDir);
            let target = chooseModel(localModels, this.settings.preferredModelId);

            if (!target) {
                const catalogEntry = MODEL_CATALOG.find((model) => model.recommended) ?? MODEL_CATALOG[0];

                this.setStatus("downloading", `Preparing ${catalogEntry.shortLabel} — first run only`, 0);
                this.emit("download", {
                    phase: "starting",
                    label: catalogEntry.label,
                    fileName: catalogEntry.fileName,
                    totalBytes: catalogEntry.approxBytes,
                    downloadedBytes: 0,
                    ratio: 0,
                });

                try {
                    await downloadCatalogModel(catalogEntry, {
                        modelsDir: this.modelsDir,
                        signal: undefined,
                        log: (message) => this.emit("log", message),
                        onProgress: (progress) => {
                            this.setStatus(
                                "downloading",
                                `Preparing ${catalogEntry.shortLabel} — ${Math.round(progress.ratio * 100)}%`,
                                progress.ratio,
                            );
                            this.emit("download", {phase: "progress", ...progress, label: catalogEntry.label});
                        },
                    });
                } catch (error) {
                    this.emit("download", {phase: "failed", label: catalogEntry.label, message: error.message});
                    throw new Error(
                        `Could not fetch ${catalogEntry.label}. VoxelChat needs the model once – check your connection, or drop any .gguf file into the models folder. (${error.message})`,
                    );
                }

                this.emit("download", {phase: "done", label: catalogEntry.label});
                target = (await listLocalModels(this.modelsDir)).find((model) => model.id === catalogEntry.id) ?? null;

                if (!target) {
                    throw new Error("The model could not be prepared.");
                }
            }

            await this.loadModel(target);
        } catch (error) {
            this.error = error.message;
            this.setStatus("error", error.message, 0);
            throw error;
        }
    }

    async loadModel(modelDescriptor) {
        await this.disposeModel();

        this.setStatus("loading", `Loading ${modelDescriptor.shortLabel ?? modelDescriptor.label}`, 0);

        if (!this.llama) {
            const gpuSetting = this.settings.gpu === false ? false : "auto";

            this.llama = await getLlama({gpu: gpuSetting, logLevel: "error"});
        }

        this.model = await this.llama.loadModel({
            modelPath: modelDescriptor.path,
            onLoadProgress: (ratio) => {
                this.setStatus("loading", `Loading ${modelDescriptor.shortLabel ?? modelDescriptor.label} — ${Math.round(ratio * 100)}%`, ratio);
            },
        });

        const contextSize = Math.max(512, Math.min(this.settings.contextSize || LLAMA_CONTEXT_DEFAULT, modelDescriptor.contextLength ?? 8192));

        this.context = await this.model.createContext({contextSize, threads: this.threadCount});
        this.sequence = this.context.getSequence();
        this.session = new LlamaChatSession({
            contextSequence: this.sequence,
            systemPrompt: this.settings.systemPrompt,
        });

        this.activeModel = modelDescriptor;
        this.setStatus("ready", "Ready to chat", 1);

        return this.status;
    }

    /**
     * Rebuilds the context with a different size. The conversation history is
     * replayed from the client on every request, so nothing is lost.
     */
    async setContextSize(contextSize) {
        if (!this.model || this.busy) return false;

        const maximum = this.activeModel?.contextLength ?? 8192;
        const size = Math.max(512, Math.min(Number(contextSize) || LLAMA_CONTEXT_DEFAULT, maximum));

        if (size === this.sequence?.contextSize) return false;

        try {
            await this.context?.dispose();
        } catch {
            /* best effort */
        }

        this.context = await this.model.createContext({contextSize: size, threads: this.threadCount});
        this.sequence = this.context.getSequence();
        this.session = new LlamaChatSession({
            contextSequence: this.sequence,
            systemPrompt: this.settings.systemPrompt,
        });

        return true;
    }

    /**
     * Streams a reply. `messages` is the full conversation in OpenAI-ish shape.
     */
    async chat({messages, onDelta, onDone, signal}) {
        if (!this.session) {
            throw new Error("The model is not ready yet.");
        }

        const history = (messages ?? []).filter((message) => message && typeof message.content === "string");
        const lastUserMessage = [...history].reverse().find((message) => message.role === "user");

        if (!lastUserMessage) {
            throw new Error("No user message to answer.");
        }

        const systemPrompt = this.settings.systemPrompt?.trim();

        this.session.setChatHistory(
            history.slice(0, history.lastIndexOf(lastUserMessage)).map((message) => {
                if (message.role === "assistant") {
                    return {type: "model", response: [message.content ?? ""]};
                }

                if (message.role === "system") {
                    return {type: "system", text: message.content ?? ""};
                }

                return {type: "user", text: message.content ?? ""};
            }),
        );

        if (systemPrompt) {
            this.session.setChatHistory([
                {type: "system", text: systemPrompt},
                ...this.session.getChatHistory().filter((message) => message.type !== "system"),
            ]);
        }

        this.abortController = new AbortController();
        this.busy = true;

        const onAbort = () => this.abortController?.abort();

        signal?.addEventListener("abort", onAbort, {once: true});

        const startedAt = Date.now();
        let reply = "";
        let tokenCount = 0;
        let stopped = false;

        try {
            await this.session.prompt(lastUserMessage.content, {
                temperature: this.settings.temperature,
                topP: this.settings.topP,
                maxTokens: this.settings.maxTokens,
                signal: this.abortController.signal,
                stopOnAbortSignal: true,
                onToken: (tokens) => {
                    tokenCount += tokens?.length ?? 0;
                },
                onTextChunk: (chunk) => {
                    reply += chunk;
                    onDelta?.(chunk);
                },
            });

            stopped = this.abortController.signal.aborted;
        } catch (error) {
            if (signal?.aborted || this.abortController.signal.aborted) {
                onDone?.({reply, stopped: true, stats: this.buildStats(tokenCount, startedAt)});

                return {reply, stopped: true};
            }

            throw error;
        } finally {
            signal?.removeEventListener("abort", onAbort);
            this.busy = false;
            this.abortController = null;
        }

        const stats = this.buildStats(tokenCount, startedAt);

        onDone?.({reply, stopped, stats});

        return {reply, stats};
    }

    buildStats(tokenCount, startedAt) {
        const elapsedMs = Math.max(1, Date.now() - startedAt);
        const tokens = tokenCount || 0;

        return {
            tokens,
            tokensPerSecond: Number(((tokens / elapsedMs) * 1000).toFixed(2)),
            elapsedMs,
            contextUsed: this.sequence?.nextTokenIndex ?? null,
            contextSize: this.sequence?.contextSize ?? null,
        };
    }

    async swapModel(modelDescriptor) {
        await this.loadModel(modelDescriptor);
    }

    async disposeModel() {
        try {
            this.session = null;
            this.sequence = null;

            if (this.context) {
                await this.context.dispose();
                this.context = null;
            }

            if (this.model) {
                await this.model.dispose();
                this.model = null;
            }
        } catch {
            // Disposing is best effort – never block the app on it.
        }
    }

    async dispose() {
        await this.disposeModel();

        if (this.llama) {
            await this.llama.dispose?.();
            this.llama = null;
        }
    }
}

export {MODEL_CATALOG};
