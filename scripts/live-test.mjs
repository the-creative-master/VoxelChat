#!/usr/bin/env node
/**
 * Live end-to-end test.
 *
 * The smoke test stubs the server. This one does not: it starts the real
 * Express server, loads the real front-end into jsdom, lets it talk to the
 * server over real HTTP (including the real SSE stream) and checks that a
 * reply actually reaches the screen.
 *
 *   node scripts/live-test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {JSDOM} from "jsdom";

import {createServer} from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const port = 7899;
const base = `http://127.0.0.1:${port}`;

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "voxelchat-live-"));
const instance = await createServer({port, host: "127.0.0.1", dataDir, quiet: true});

console.log("▌  server is up, waiting for the model …");

instance.engine.boot().catch((error) => console.error("✖  boot failed:", error.message));

const deadline = Date.now() + 180_000;

while (Date.now() < deadline) {
    const status = await fetch(`${base}/api/status`).then((response) => response.json());

    if (status.phase === "ready") {
        console.log(`✔  model ready: ${status.model.label} (${status.threads} threads)`);
        break;
    }

    if (status.phase === "error") {
        console.error(`✖  the engine failed: ${status.error}`);
        await instance.close();
        process.exit(1);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
}

/* ── a browser-ish environment ───────────────────────────────────────────── */

const html = await fs.readFile(path.join(projectRoot, "public", "index.html"), "utf8");
const dom = new JSDOM(html, {url: `${base}/`, pretendToBeVisual: true});
const {window} = dom;

globalThis.window = window;
globalThis.document = window.document;

Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
    writable: true,
});

const storage = new Map();

globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
};

// Real HTTP – relative URLs resolved against the server.
const nodeFetch = globalThis.fetch;

globalThis.fetch = (url, options) => nodeFetch(new URL(url, base).toString(), options);

// Deliberately no EventSource: the app must not need a long lived
// connection to work.
globalThis.EventSource = class {
    constructor(url) {
        this.listeners = new Map();
        this.url = url;

        this.controller = new AbortController();

        this.pump();
    }

    async pump() {
        const response = await nodeFetch(new URL(this.url, base).toString(), {
            headers: {Accept: "text/event-stream"},
            signal: this.controller.signal,
        }).catch(() => null);

        if (!response?.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const {value, done} = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, {stream: true});

            let index;

            while ((index = buffer.indexOf("\n\n")) !== -1) {
                const raw = buffer.slice(0, index);
                buffer = buffer.slice(index + 2);

                let event = "message";
                const dataLines = [];

                for (const line of raw.split("\n")) {
                    if (line.startsWith("event:")) event = line.slice(6).trim();
                    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
                }

                if (!dataLines.length) continue;

                const payload = {data: dataLines.join("\n"), type: event};

                for (const handler of this.listeners.get(event) ?? []) handler(payload);
                for (const handler of this.listeners.get("message") ?? []) handler(payload);
            }
        }
    }

    addEventListener(type, handler) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);

        this.listeners.get(type).push(handler);
    }

    close() {
        this.controller.abort();
    }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

window.addEventListener("error", (event) => {
    console.error("✖  front-end error:", event.error ?? event.message);
});

process.on("unhandledRejection", (error) => {
    console.error("✖  unhandled rejection:", error);
});

/* ── drive the app ───────────────────────────────────────────────────────── */

await import(path.join(projectRoot, "public", "app.js"));

const $ = (selector) => window.document.querySelector(selector);

const bootDeadline = Date.now() + 60_000;

while (Date.now() < bootDeadline) {
    if ($("#boot-stage")?.textContent === "Ready" && !$("#app").classList.contains("is-hidden")) break;

    await sleep(200);
}

assert.equal($("#boot-stage").textContent, "Ready", "the boot screen should reach the ready state");
assert.ok(!$("#app").classList.contains("is-hidden"), "the chat shell should be visible");
assert.equal($("#model-name").textContent, "SmolLM2 1.7B Instruct", "the model chip should name the 1.7B model");

console.log("▌  the app is ready, asking a question …");

$("#input").value = "Reply with exactly the word: working";
$("#input").dispatchEvent(new window.Event("input"));
$("#send-button").click();

const replyDeadline = Date.now() + 180_000;
let reply = "";

while (Date.now() < replyDeadline) {
    const nodes = window.document.querySelectorAll("#messages .message--assistant .message__content");
    reply = nodes[nodes.length - 1]?.textContent ?? "";

    if (reply.trim() && !reply.includes("caret") && reply.length > 4) break;

    await sleep(500);
}

console.log(`▌  the screen says: ${JSON.stringify(reply.slice(0, 160))}`);

assert.ok(reply.trim().length > 0, "the reply should be rendered on the screen");
assert.ok(!reply.startsWith("⚠️"), `the reply should not be an error: ${reply.slice(0, 120)}`);
assert.ok(reply.length > 3, `the reply should have some content, got: ${reply.slice(0, 200)}`);

// The fallback path: one request, the whole answer.
const oneShot = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({messages: [{role: "user", content: "Say only: fallback"}], stream: false}),
}).then((response) => response.json());

assert.ok(oneShot.reply?.length, "the one-shot endpoint should answer as well");
assert.ok(oneShot.stats?.tokens > 0, "the one-shot endpoint should report its statistics");

console.log("✔ the one-shot fallback answers too");

console.log("\n✔ VoxelChat live end-to-end test passed");

dom.window.close();
await instance.close();
await fs.rm(dataDir, {recursive: true, force: true});
process.exit(0);
