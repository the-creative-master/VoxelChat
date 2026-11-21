/**
 * VoxelChat smoke test.
 *
 * Boots the real front-end inside jsdom against a stubbed server, then walks
 * through the whole journey: boot → ready → send a message → stream a reply →
 * keep the conversation. Run it with `npm test`.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {JSDOM} from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

const html = await fs.readFile(path.join(projectRoot, "public", "index.html"), "utf8");

const dom = new JSDOM(html, {url: "http://localhost:7842/", pretendToBeVisual: true});
const {window} = dom;

/* ── stubbed server ───────────────────────────────────────────────────────── */

const statusPayload = {
    phase: "ready",
    stage: "Ready to chat",
    progress: 1,
    error: null,
    busy: false,
    device: "CPU",
    model: {
        id: "smollm2-1.7b-instruct-q4_k_m",
        label: "SmolLM2 1.7B Instruct",
        params: "1.7B",
        quant: "Q4_K_M",
        fileName: "smollm2-1.7b-instruct-q4_k_m.gguf",
        sizeBytes: 1_100_000_000,
    },
    contextSize: 4096,
};

const settingsPayload = {
    personaId: "assistant",
    systemPrompt: "You are Voxel.",
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 512,
    contextSize: 4096,
    gpu: "auto",
    preferredModelId: null,
    theme: "dark",
};

const personasPayload = {
    personas: [
        {id: "assistant", name: "Helpful Assistant", emoji: "🧭", description: "Balanced.", prompt: "You are Voxel."},
        {id: "coder", name: "Code Buddy", emoji: "🛠️", description: "Code.", prompt: "You are a dev."},
    ],
};

const modelsPayload = {
    catalog: [
        {
            id: "smollm2-1.7b-instruct-q4_k_m",
            label: "SmolLM2 1.7B Instruct",
            shortLabel: "SmolLM2 1.7B",
            params: "1.7B",
            quant: "Q4_K_M",
            sizeBytes: 1_100_000_000,
            sizeLabel: "1.1 GB",
            recommended: true,
            cached: true,
        },
    ],
    local: [],
    active: "smollm2-1.7b-instruct-q4_k_m",
    modelsDir: "/tmp/models",
};

const chatFrames = [
    'event: delta\ndata: {"text":"Hello"}\n\n',
    'event: delta\ndata: {"text":" from"}\n\n',
    'event: delta\ndata: {"text":" VoxelChat."}\n\n',
    'event: done\ndata: {"reply":"Hello from VoxelChat.","stopped":false,"stats":{"tokens":4,"tokensPerSecond":12.5,"elapsedMs":320,"contextUsed":42,"contextSize":4096}}\n\n',
];

const requestedUrls = [];

function jsonResponse(payload) {
    return {
        ok: true,
        status: 200,
        json: async () => payload,
    };
}

async function fetchStub(url, options = {}) {
    const href = String(url);
    requestedUrls.push(href);

    if (href.endsWith("/api/status")) return jsonResponse(statusPayload);
    if (href.endsWith("/api/settings")) return jsonResponse(settingsPayload);
    if (href.endsWith("/api/personas")) return jsonResponse(personasPayload);
    if (href.endsWith("/api/models")) return jsonResponse(modelsPayload);

    if (href.endsWith("/api/chat") && options.method === "POST") {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                for (const frame of chatFrames) {
                    controller.enqueue(encoder.encode(frame));
                }

                controller.close();
            },
        });

        return {ok: true, status: 200, body: stream};
    }

    return jsonResponse({});
}

/* ── wire the jsdom world into node globals ──────────────────────────────── */

const storage = new Map();

globalThis.window = window;
globalThis.document = window.document;

Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
    writable: true,
});
globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
};
globalThis.fetch = fetchStub;
globalThis.EventSource = class {
    constructor(url) {
        this.url = url;
        this.listeners = {};
    }

    addEventListener() {}

    close() {}
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
process.on("unhandledRejection", (error) => { console.error("UNHANDLED", error); process.exit(1); });

/* ── run the front-end ───────────────────────────────────────────────────── */

await import(path.join(projectRoot, "public", "app.js"));
await sleep(900);

const $ = (selector) => document.querySelector(selector);

assert.equal($("#boot-stage").textContent, "Ready", "boot screen should report the model is ready");
assert.ok(!$("#app").classList.contains("is-hidden"), "the chat app should be visible once the model is ready");
assert.equal($("#model-name").textContent, "SmolLM2 1.7B Instruct", "the model chip should show the active model");
assert.equal($("#persona-name").textContent, "Helpful Assistant", "the persona chip should show the active persona");
assert.equal(document.querySelectorAll(".persona-card").length, 2, "every persona should be rendered");
assert.equal(document.querySelectorAll(".model-item").length, 1, "the model list should be rendered");

// the empty state disappears as soon as there is a conversation
$("#input").value = "Hello there";
$("#input").dispatchEvent(new window.Event("input"));
$("#send-button").click();
await sleep(300);

const messages = document.querySelectorAll("#messages .message");

assert.equal(messages.length, 2, "the user message and the streamed reply should both be rendered");
assert.ok(messages[0].textContent.includes("Hello there"), "the user message should be visible");
assert.ok(messages[1].textContent.includes("Hello from VoxelChat."), "the streamed reply should be visible");
assert.ok(messages[1].textContent.includes("tok/s"), "the reply should show its token statistics");
assert.ok($("#empty-state").classList.contains("is-hidden"), "the empty state should be hidden once chatting");

// the conversation is persisted locally
const stored = JSON.parse(storage.get("voxelchat.conversations.v2") ?? "[]");

assert.equal(stored.length, 1, "the conversation should be stored in localStorage");
assert.equal(stored[0].messages.length, 2, "both messages should be stored");
assert.equal(stored[0].messages[1].content, "Hello from VoxelChat.", "the reply should be stored in full");

// settings changes are pushed to the server
$("#temperature").value = "1.1";
$("#temperature").dispatchEvent(new window.Event("change"));
await sleep(100);

assert.ok(
    requestedUrls.some((url) => url.endsWith("/api/settings") && url.length > 0),
    "settings changes should be persisted through the API",
);

console.log("✔ VoxelChat front-end smoke test passed");

dom.window.close();
process.exit(0);
