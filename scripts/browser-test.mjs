#!/usr/bin/env node
/**
 * Real browser test.
 *
 * Loads VoxelChat in headless Chromium (the real layout, the real CSS, the
 * real network stack) and walks through the journey a user takes: open the
 * page, wait for the model, type a question, press Enter, read the answer.
 *
 * It also reports every console error and every failed request, which is how
 * a broken preview shows up.
 *
 *   node scripts/browser-test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

import {createServer} from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const port = 7898;
const target = `http://127.0.0.1:${port}`;

// A base URL can point at a proxy in front of the app, to test the app the
// way a preview proxy puts in front of it.
const base = process.env.VOXELCHAT_TEST_BASE ?? target;

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "voxelchat-browser-"));
const instance = await createServer({port, host: "127.0.0.1", dataDir, quiet: false});

instance.engine.boot().catch((error) => console.error("✖  boot failed:", error.message));

console.log("▌  waiting for the model …");

const deadline = Date.now() + 180_000;

while (Date.now() < deadline) {
    const status = await fetch(`${target}/api/status`).then((response) => response.json());

    if (status.phase === "ready") {
        console.log(`✔  model ready: ${status.model.label}`);
        break;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
}

const executablePath = await chromium.executablePath();

// The shared libraries Chromium needs are shipped in the package for
// Amazon Linux – unpack them here so the browser can start anywhere.
const libraryPath = path.join(os.tmpdir(), "al2023", "lib");

try {
    await fs.access(path.join(libraryPath, "libnspr4.so"));
} catch {
    const {inflate} = await import(
        path.join(projectRoot, "node_modules", "@sparticuz", "chromium", "build", "lambdafs.js")
    );
    const binDir = path.join(projectRoot, "node_modules", "@sparticuz", "chromium", "bin");

    await inflate(path.join(binDir, "al2023.tar.br")).catch(() => {});
}

process.env.LD_LIBRARY_PATH = [libraryPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const viewport = process.env.VOXELCHAT_TEST_VIEWPORT
    ? {
          width: Number(process.env.VOXELCHAT_TEST_VIEWPORT.split("x")[0]),
          height: Number(process.env.VOXELCHAT_TEST_VIEWPORT.split("x")[1]),
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 3,
      }
    : {width: 1280, height: 900};

const browser = await puppeteer.launch({
    args: [...chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: viewport,
    env: {...process.env},
    executablePath,
    headless: "shell",
});

const page = await browser.newPage();

const consoleErrors = [];
const failedRequests = [];

page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on("requestfailed", (request) =>
    failedRequests.push(`${request.method()} ${request.url()} – ${request.failure()?.errorText}`),
);

console.log("▌  opening the page …");

await page.goto(base, {waitUntil: "domcontentloaded", timeout: 60_000});

// Visit once more with a warm cache: the browser then asks the server with
// "If-None-Match" and gets a 304 back – an empty body that must not break
// the app.
await page.goto(base, {waitUntil: "domcontentloaded", timeout: 60_000});

// The boot screen must hand over to the chat.
await page.waitForFunction(() => !document.querySelector("#app").classList.contains("is-hidden"), {
    timeout: 60_000,
});

console.log("✔  the chat is on screen");

// The boot screen fades out – give it the time it asked for.
await new Promise((resolve) => setTimeout(resolve, 1200));

/* ── the layout has to be usable ────────────────────────────────────────── */

const layout = await page.evaluate(() => {
    const input = document.querySelector("#input");
    const send = document.querySelector("#send-button");
    const composer = document.querySelector(".composer");
    const boot = document.querySelector("#boot");

    const box = (element) => {
        const rect = element.getBoundingClientRect();

        return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
    };

    const point = document.elementFromPoint(
        Math.round(input.getBoundingClientRect().x + input.getBoundingClientRect().width / 2),
        Math.round(input.getBoundingClientRect().y + input.getBoundingClientRect().height / 2),
    );

    return {
        input: box(input),
        send: box(send),
        composer: box(composer),
        bootVisible: getComputedStyle(boot).visibility !== "hidden",
        bootOpacity: getComputedStyle(boot).opacity,
        topElementAtInput: point?.id || point?.className || point?.tagName,
        topElementIsInput: point === input,
        viewport: {width: window.innerWidth, height: window.innerHeight},
    };
});

console.log("▌  layout:", JSON.stringify(layout));

assert.ok(layout.input.height > 10, "the composer input should have a height");
assert.ok(layout.input.width > 100, `the composer input should be wide, got ${layout.input.width}`);
assert.ok(
    layout.input.y + layout.input.height <= layout.viewport.height + 1,
    `the composer should be inside the viewport, got ${JSON.stringify(layout.input)} in ${JSON.stringify(layout.viewport)}`,
);
assert.ok(!layout.bootVisible, "the boot screen should be gone");
assert.ok(layout.topElementIsInput, `the input should be clickable, but ${layout.topElementAtInput} is on top`);
assert.ok(layout.send.width > 10, "the send button should have a size");

/* ── ask a question ─────────────────────────────────────────────────────── */

console.log("▌  asking a question …");

await page.click("#input");
await page.type("#input", "In one sentence, what is the ocean?");
await page.keyboard.press("Enter");

// The answer has to show up in the chat.
// Wait until the reply is complete: the caret only disappears when the
// stream is done.
await page.waitForFunction(
    () => {
        const bubbles = document.querySelectorAll("#messages .message--assistant .message__content");

        if (!bubbles.length) return false;

        const last = bubbles[bubbles.length - 1];

        return last.textContent.trim().length > 0 && !last.querySelector(".caret");
    },
    {timeout: 180_000},
);

const answer = await page.evaluate(() => {
    const bubbles = document.querySelectorAll("#messages .message--assistant .message__content");

    return bubbles[bubbles.length - 1].textContent.trim();
});

console.log(`✔  the screen says: ${JSON.stringify(answer.slice(0, 160))}`);

assert.ok(!answer.startsWith("⚠️"), `the answer should not be an error: ${answer.slice(0, 160)}`);
assert.ok(answer.length > 0, "the answer should have some content");

/* ── no errors, no failed requests ──────────────────────────────────────── */

if (consoleErrors.length) {
    console.log("✖  console errors:");
    for (const error of consoleErrors) console.log(`     ${error}`);
}

if (failedRequests.length) {
    console.log("✖  failed requests:");
    for (const failure of failedRequests) console.log(`     ${failure}`);
}

assert.equal(consoleErrors.length, 0, "the page should not log any errors");
assert.equal(failedRequests.length, 0, "no request should fail");

console.log("\n✔ VoxelChat browser test passed");

await browser.close();
await instance.close();
await fs.rm(dataDir, {recursive: true, force: true});
process.exit(0);
