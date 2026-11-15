#!/usr/bin/env node
/**
 * VoxelChat launcher.
 *
 * `npm start` -> this file. It makes sure everything the app needs is in
 * place (dependencies, llama.cpp binaries, the model), starts the local
 * server and opens your browser. No configuration, no accounts, no keys.
 */
import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {createServer} from "./server.js";
import {formatBytes} from "./model-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

const COLOR = {
    reset: "[0m",
    dim: "[2m",
    bold: "[1m",
    cyan: "[38;5;80m",
    violet: "[38;5;141m",
    green: "[38;5;114m",
    yellow: "[38;5;221m",
    red: "[38;5;203m",
};

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (color, text) => (useColor ? `${COLOR[color]}${text}${COLOR.reset}` : text);

function banner(subtitle = "chat with SmolLM2 1.7B – locally, offline, zero setup") {
    console.log("");
    console.log(`  ${paint("cyan", "▛▀▖▛")}  ${paint("bold", "VoxelChat")} ${paint("dim", "v2.0")}`);
    console.log(`  ${paint("violet", "▌")}  ${subtitle}`);
    console.log("");
}

function ensureDependencies() {
    const nodeModules = path.join(projectRoot, "node_modules");

    if (fs.existsSync(path.join(nodeModules, "node-llama-cpp"))) {
        return Promise.resolve();
    }

    console.log("  " + paint("yellow", "◌") + " First run: installing the engine (one time, ~30 seconds)…");

    return new Promise((resolve, reject) => {
        const npm = process.platform === "win32" ? "npm.cmd" : "npm";
        const child = spawn(npm, ["install", "--no-audit", "--no-fund"], {
            cwd: projectRoot,
            stdio: "inherit",
            env: {...process.env, npm_config_update_notifier: "false"},
        });

        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`npm install exited with code ${code}`));
            }
        });
    });
}

function openBrowser(url) {
    if (process.env.VOXELCHAT_NO_OPEN === "1") return;

    const commands = {
        darwin: ["open", [url]],
        win32: ["cmd", ["/c", "start", "", url]],
    };

    const [command, args] = commands[process.platform] ?? ["xdg-open", [url]];

    try {
        const child = spawn(command, args, {detached: true, stdio: "ignore"});
        child.on("error", () => {});
        child.unref();
    } catch {
        // Opening a browser is a nicety – never fail the app because of it.
    }
}

async function listenForPort(preferred) {
    const candidates = [preferred, preferred + 1, preferred + 2, preferred + 3];

    for (const port of candidates) {
        try {
            return await createServer({port, openBrowser: false});
        } catch (error) {
            if (error?.code !== "EADDRINUSE") throw error;
        }
    }

    throw new Error("Could not find a free port for VoxelChat.");
}

async function main() {
    banner();

    await ensureDependencies();

    const instance = await listenForPort(Number(process.env.PORT) || 7842);
    const {engine, modelsDir} = instance;

    const model = engine.activeModel;
    const modelLabel = model ? `${model.label} (${model.quant}, ${formatBytes(model.sizeBytes)})` : "preparing SmolLM2…";

    console.log(`  ${paint("green", "▌")}  Model    ${modelLabel}`);
    console.log(`  ${paint("green", "▌")}  Engine   llama.cpp via node-llama-cpp`);
    console.log(`  ${paint("green", "▌")}  Storage  ${modelsDir}`);
    console.log(`  ${paint("green", "▌")}  Chat     ${paint("bold", instance.url)}`);
    console.log("");
    console.log("  " + paint("dim", "The browser opens automatically. Press Ctrl+C to stop VoxelChat."));
    console.log("");

    openBrowser(instance.url);

    engine.on("status", (status) => {
        if (status.phase === "ready") {
            console.log(`  ${paint("green", "✔")}  ${status.model?.label ?? "Model"} is live – start typing!`);
            console.log("");
        }

        if (status.phase === "error") {
            console.error(`  ${paint("red", "✖")}  ${status.error}`);
        }
    });

    engine.on("download", (payload) => {
        if (payload.phase === "progress") {
            const percent = Math.round((payload.ratio ?? 0) * 100);

            process.stdout.write(`\r  ${paint("cyan", "↓")}  ${payload.label} ${percent}% (${formatBytes(payload.downloadedBytes ?? 0)} / ${formatBytes(payload.totalBytes ?? 0)})   `);
        }

        if (payload.phase === "done") {
            process.stdout.write("\r  " + " ".repeat(72) + "\r");
            console.log(`  ${paint("green", "✔")}  ${payload.label} cached – no more downloads.`);
        }

        if (payload.phase === "failed") {
            process.stdout.write("\r  " + " ".repeat(72) + "\r");
            console.error(`  ${paint("red", "✖")}  Could not prepare ${payload.label}: ${payload.message}`);
        }
    });

    engine.boot().catch((error) => {
        console.error(`  ${paint("red", "✖")}  ${error.message}`);
        console.log("");
        console.log("  " + paint("dim", "VoxelChat will keep running – drop any .gguf file into the models folder and press Retry."));
        console.log("");
    });

    const shutdown = async () => {
        console.log("\n  " + paint("dim", "Shutting down VoxelChat…"));
        await instance.close();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch((error) => {
    console.error(`\n  ${paint("red", "✖")}  VoxelChat could not start: ${error.message}\n`);
    process.exit(1);
});
