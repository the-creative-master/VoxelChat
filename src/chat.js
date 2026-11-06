import {LlamaChatSession} from "node-llama-cpp";
import {getContext, isReady} from "./model-manager.js";

export const DEFAULT_SYSTEM_PROMPT =
    "You are VoxelChat, a friendly and concise assistant running entirely on the user's own computer. " +
    "Answer in clear, plain language. If you are unsure about something, say so instead of guessing.";

const MAX_HISTORY_MESSAGES = 24;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_TOKENS = Number(process.env.VOXELCHAT_MAX_TOKENS || 512);

export class ChatBusyError extends Error {}
export class ChatValidationError extends Error {}

let generationInFlight = false;

/**
 * Normalize and validate a browser-supplied message list.
 * Only plain user/assistant text turns are accepted; the system prompt is server-controlled.
 */
export function normalizeMessages(rawMessages) {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0)
        throw new ChatValidationError("A non-empty messages array is required.");

    const messages = rawMessages
        .filter(message => message != null && (message.role === "user" || message.role === "assistant"))
        .map(message => ({
            role: message.role,
            content: String(message.content ?? "").trim()
        }))
        .filter(message => message.content.length > 0)
        .map(message => ({...message, content: message.content.slice(0, MAX_MESSAGE_LENGTH)}));

    if (messages.length === 0)
        throw new ChatValidationError("No usable messages were provided.");

    if (messages[messages.length - 1].role !== "user")
        throw new ChatValidationError("The last message must come from the user.");

    return messages.slice(-MAX_HISTORY_MESSAGES);
}

export function normalizeSystemPrompt(rawSystemPrompt) {
    if (rawSystemPrompt == null) return DEFAULT_SYSTEM_PROMPT;

    const systemPrompt = String(rawSystemPrompt).trim().slice(0, 4000);
    return systemPrompt.length > 0 ? systemPrompt : DEFAULT_SYSTEM_PROMPT;
}

export function isGenerating() {
    return generationInFlight;
}

/**
 * Build a fresh session over the shared context sequence, seeded with the prior turns
 * so the model sees the full conversation even though the session object is new.
 */
function createSession(systemPrompt, priorMessages) {
    const session = new LlamaChatSession({
        contextSequence: getContext().getSequence(),
        // The context owns a limited pool of sequences (we create it with exactly one),
        // so the session must hand the sequence back when it is disposed. Without this,
        // every request after the first fails with "No sequences left".
        autoDisposeSequence: true,
        systemPrompt
    });

    session.setChatHistory([
        {type: "system", text: systemPrompt},
        ...priorMessages.map(message => (
            message.role === "user"
                ? {type: "user", text: message.content}
                : {type: "model", response: [message.content]}
        ))
    ]);

    return session;
}

/**
 * Generate a response, streaming text chunks through `onTextChunk`.
 * Throws {@link ChatBusyError} if another generation is already running.
 */
export async function generateReply({messages, systemPrompt, signal, onTextChunk}) {
    if (!isReady())
        throw new Error("The model is not loaded yet.");

    if (generationInFlight)
        throw new ChatBusyError("A response is already being generated. Wait for it to finish or stop it first.");

    const prompt = messages[messages.length - 1];
    const priorMessages = messages.slice(0, -1);
    const session = createSession(systemPrompt, priorMessages);

    generationInFlight = true;
    let fullText = "";

    try {
        const response = await session.prompt(prompt.content, {
            maxTokens: MAX_TOKENS,
            temperature: 0.7,
            topP: 0.95,
            signal,
            stopOnAbortSignal: true,
            onTextChunk(chunk) {
                fullText += chunk;

                // The wrapper can emit empty strings for non-text segments; don't stream those.
                if (chunk.length > 0) onTextChunk(chunk);
            }
        });

        fullText = typeof response === "string" && response.length > 0 ? response : fullText;
        return {text: fullText, stopReason: signal?.aborted ? "aborted" : "completed"};
    } finally {
        generationInFlight = false;
        session.dispose();
    }
}

export function waitForIdle({timeoutMs = 10000} = {}) {
    const startedAt = Date.now();

    return new Promise(resolve => {
        const check = () => {
            if (!generationInFlight || Date.now() - startedAt > timeoutMs) return resolve();
            setTimeout(check, 100);
        };

        check();
    });
}
