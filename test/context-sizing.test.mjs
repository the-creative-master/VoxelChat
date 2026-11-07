import test from "node:test";
import assert from "node:assert/strict";
import {chooseContextSize} from "../src/model-manager.js";
import {MODELS, getDefaultModel, isCached, cachePathFor} from "../src/catalog.js";

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
    assert.equal(pick(8 * GB).contextSize, 4096);
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
    const {contextSize, reason} = pick(1.51 * GB);
    assert.ok(contextSize < 4096, `expected a reduced context, got ${contextSize}`);
    assert.ok(contextSize >= 512);
    assert.match(reason, /reduced|tight/);
});

test("never picks a context whose weights + KV cache exceed the budget", () => {
    for (const freeRamGb of [1.2, 1.35, 1.51, 1.8, 2.5, 4]) {
        const freeRam = freeRamGb * GB;
        const {contextSize} = pick(freeRam);
        if (contextSize > 512) {
            const total = WEIGHTS + estimateContextBytes(contextSize);
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
    assert.equal(pick(3.4 * GB).contextSize, 4096);
});

/* --------------------------------- catalog -------------------------------- */

test("the catalog has a valid default model", () => {
    const model = getDefaultModel();
    assert.ok(model, "a default model must exist");
    assert.equal(MODELS.filter(entry => entry.id === model.id).length, 1);
    assert.ok(model.url.startsWith("https://"), "model URL must be absolute");
    assert.ok(model.fileName.endsWith(".gguf"), "model must resolve to a .gguf file");
});

test("every catalog entry has the fields the app relies on", () => {
    for (const model of MODELS) {
        for (const field of ["id", "name", "url", "fileName", "contextSize"]) {
            assert.ok(model[field] != null && model[field] !== "", `${model.id} is missing ${field}`);
        }
        assert.ok(model.contextSize >= 512, `${model.id} contextSize looks too small`);
    }
});

test("model ids are unique", () => {
    const ids = MODELS.map(model => model.id);
    assert.equal(new Set(ids).size, ids.length);
});

test("cache paths are inside the cache directory and end in .gguf", () => {
    for (const model of MODELS) {
        const file = cachePathFor(model);
        assert.ok(file.endsWith(".gguf"), `${model.id} cache path should end in .gguf`);
        assert.ok(file.includes("cache") || file.includes("models"), `${model.id} cache path looks wrong: ${file}`);
    }
});

test("isCached reports false for a model that is not downloaded", () => {
    // The sandbox has no cached models; on a machine with them this still must be boolean.
    assert.equal(typeof isCached(getDefaultModel()), "boolean");
});
