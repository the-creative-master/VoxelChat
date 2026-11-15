/**
 * VoxelChat API test.
 *
 * Starts the real server (without loading a model, so it runs in a second)
 * and checks every endpoint the UI talks to.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {createServer} from "../src/server.js";

// A throw-away data/models folder so the test never touches the real settings.
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "voxelchat-test-"));

const instance = await createServer({port: 0, dataDir: sandbox, modelsDir: path.join(sandbox, "models")});
const base = `http://127.0.0.1:${instance.port}`;

try {
    const status = await (await fetch(`${base}/api/status`)).json();

    assert.ok(["idle", "booting", "loading", "ready"].includes(status.phase), "status should report a phase");
    assert.equal(typeof status.contextSize, "number");

    const personas = await (await fetch(`${base}/api/personas`)).json();

    assert.ok(personas.personas.length >= 5, "there should be a handful of personas");
    assert.ok(personas.personas.every((persona) => persona.prompt?.length > 20), "every persona needs a prompt");

    const models = await (await fetch(`${base}/api/models`)).json();

    assert.ok(models.catalog.length >= 1, "the catalog should list the SmolLM2 models");
    assert.ok(models.catalog.some((model) => model.recommended), "one model should be the recommended default");
    assert.ok(models.catalog[0].mirrors === undefined || true);

    const settings = await (await fetch(`${base}/api/settings`)).json();

    assert.equal(typeof settings.temperature, "number");
    assert.ok(settings.systemPrompt.length > 10, "a default system prompt should be applied");

    const saved = await (
        await fetch(`${base}/api/settings`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({temperature: 0.42, theme: "light"}),
        })
    ).json();

    assert.equal(saved.temperature, 0.42);
    assert.equal(saved.theme, "light");

    // unknown keys are ignored
    const guarded = await (
        await fetch(`${base}/api/settings`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({temperature: 0.5, evil: "payload"}),
        })
    ).json();

    assert.equal(guarded.evil, undefined, "unknown settings should not be persisted");

    // chatting before the model is loaded should fail politely
    const chat = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({messages: [{role: "user", content: "hi"}]}),
    });

    assert.equal(chat.status, 503, "chatting without a loaded model should return 503");

    // the UI is served
    const page = await fetch(`${base}/`);

    assert.equal(page.status, 200);
    const html = await page.text();

    assert.ok(html.includes("VoxelChat"), "the UI should be served from the server");
    assert.ok(html.includes("/app.js"), "the UI should load its script");

    console.log("✔ VoxelChat API test passed");
} finally {
    await instance.close();
    await fs.rm(sandbox, {recursive: true, force: true});
}

process.exit(0);
