import test from "node:test";
import assert from "node:assert/strict";
import {chooseContextSize} from "../src/model-manager.js";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Real SmolLM2 1.7B Instruct Q4_K_M figures. */
const WEIGHTS = 1060 * MB;

/**
 * KV cache cost for SmolLM2 1.7B: 24 layers x 2048 kv-dim x 2 (K and V) x 2 bytes,
 * plus llama.cpp's compute-graph overhead (~40 MB at these sizes).
 */
const estimateContextBytes = size => Math.round(24 * 2048 * 2 * 2 * size + 40 * MB);

const pick = freeRamBytes => chooseContextSize({
    freeRamBytes,
    weightsBytes: WEIGHTS,
    maxContextSize: 4096,
    estimateContextBytes
});

test("uses the full context when RAM is plentiful", () => {
    const {contextSize} = pick(8 * GB);
    assert.equal(contextSize, 4096);
});

test("does not exceed the model's trained window even with huge RAM", () => {
    const {contextSize} = chooseContextSize({
        freeRamBytes: 64 * GB,
        weightsBytes: WEIGHTS,
        maxContextSize: 2048,
        estimateContextBytes
    });
    assert.equal(contextSize, 2048);
});

test("shrinks the context to fit a 2 GB machine", () => {
    // With a 0.85 safety factor this is what a 2 GB box gives the picker.
    const {contextSize, reason} = pick(1.51 * GB);
    assert.ok(contextSize < 4096, `expected a reduced context, got ${contextSize}`);
    assert.ok(contextSize >= 512);
    assert.match(reason, /reduced|tight/);
});

test("never picks a context whose weights + KV cache exceed the budget", () => {
    for (const freeRamGb of [1.2, 1.35, 1.51, 1.8, 2.5, 4]) {
        const freeRam = freeRamGb * GB;
        const {contextSize} = pick(freeRam);
        const total = WEIGHTS + estimateContextBytes(contextSize);
        // The only exception is the unavoidable smallest option.
        if (contextSize > 512) {
            assert.ok(
                total <= freeRam,
                `ctx ${contextSize} needs ${(total / MB).toFixed(0)}MB but budget was ${(freeRam / MB).toFixed(0)}MB`
            );
        }
    }
});

test("falls back to the smallest context when memory is very tight", () => {
    const {contextSize, reason} = pick(900 * MB);
    assert.equal(contextSize, 512);
    assert.match(reason, /very tight/);
});

test("degrades gracefully when estimation is unavailable", () => {
    const {contextSize} = chooseContextSize({
        freeRamBytes: 8 * GB,
        weightsBytes: WEIGHTS,
        maxContextSize: 4096,
        estimateContextBytes: () => null
    });
    assert.equal(contextSize, 512);
});

test("a 4 GB machine gets the full 4096 context", () => {
    const {contextSize} = pick(3.4 * GB);
    assert.equal(contextSize, 4096);
});
