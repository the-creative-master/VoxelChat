import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createWriteStream} from "node:fs";
import {Transform, Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {CACHE_DIR, cachePathFor} from "./catalog.js";

/**
 * Model file cache.
 *
 * Downloads land in a `.partial` file and are renamed into place only once complete and
 * verified. A crash, a dropped connection, or a Ctrl-C therefore never leaves a truncated
 * .gguf behind that would later load as garbage — which is exactly the failure mode that
 * makes a broken model look like a working one.
 */

const inFlight = new Map();

export function partialPathFor(model) {
    return `${cachePathFor(model)}.partial`;
}

/** Download a model into the cache. Concurrent calls for the same model share one download. */
export function fetchModelToCache(model, {onProgress} = {}) {
    const existing = inFlight.get(model.id);
    if (existing != null) return existing;

    const task = download(model, {onProgress}).finally(() => inFlight.delete(model.id));
    inFlight.set(model.id, task);
    return task;
}

async function download(model, {onProgress}) {
    const destination = cachePathFor(model);
    const partial = partialPathFor(model);

    fs.mkdirSync(path.dirname(destination), {recursive: true});
    await fs.promises.rm(partial, {force: true});

    const response = await fetch(model.url, {redirect: "follow"});
    if (!response.ok || response.body == null)
        throw new Error(`Downloading ${model.name} failed with HTTP ${response.status}.`);

    const totalBytes = Number(response.headers.get("content-length")) || model.sizeBytes || 0;
    let downloadedBytes = 0;
    let lastReport = 0;

    const progress = new Transform({
        transform(chunk, _encoding, callback) {
            downloadedBytes += chunk.length;
            const now = Date.now();
            if (now - lastReport >= 200 || downloadedBytes === totalBytes) {
                lastReport = now;
                onProgress?.({downloadedBytes, totalBytes});
            }
            callback(null, chunk);
        }
    });

    try {
        await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(partial));
    } catch (error) {
        await fs.promises.rm(partial, {force: true});
        throw new Error(`Downloading ${model.name} was interrupted (${error.message}). Try again.`);
    }

    const size = (await fs.promises.stat(partial)).size;

    if (model.minValidBytes != null && size < model.minValidBytes) {
        await fs.promises.rm(partial, {force: true});
        const expected = model.sizeBytes ? `${(model.sizeBytes / 1024 ** 3).toFixed(2)} GB` : "much larger";
        throw new Error(
            `The downloaded file is only ${(size / 1024 ** 2).toFixed(0)} MB but ${model.name} should be ` +
            `${expected}. It was probably an error page rather than the model.`
        );
    }

    if (model.sha256 != null) {
        onProgress?.({downloadedBytes: size, totalBytes: size, verifying: true});

        const actual = await sha256File(partial);
        if (actual.toLowerCase() !== model.sha256.toLowerCase()) {
            await fs.promises.rm(partial, {force: true});
            throw new Error(
                `The downloaded ${model.name} file is corrupt (checksum mismatch) and was deleted. Try again.`
            );
        }
    }

    // Atomic publish: the file appears in the cache complete or not at all.
    await fs.promises.rename(partial, destination);

    onProgress?.({downloadedBytes: size, totalBytes: size, done: true});
    return destination;
}

export function removeCachedModel(model) {
    fs.rmSync(cachePathFor(model), {force: true});
    fs.rmSync(partialPathFor(model), {force: true});
}

function sha256File(file) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(file);

        stream.on("data", chunk => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

/** Total bytes currently used by cached files. */
export function cacheUsageBytes() {
    try {
        return fs.readdirSync(CACHE_DIR)
            .filter(name => name.endsWith(".gguf") || name.endsWith(".partial"))
            .reduce((sum, name) => sum + fs.statSync(path.join(CACHE_DIR, name)).size, 0);
    } catch {
        return 0;
    }
}
