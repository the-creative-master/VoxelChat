#!/usr/bin/env node
/**
 * Builds a self-contained VoxelChat app folder.
 *
 * The result is a folder that runs with a double-click: it contains the app
 * source, the prebuilt llama.cpp binaries, the model weights and its own Node
 * runtime. No `npm install`, no commands, no configuration – just open it and
 * start chatting.
 *
 *   npm run build:app                        # current platform
 *   npm run build:app -- --platform darwin-arm64
 *   npm run build:app -- --platform all
 */
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import {constants as fsConstants} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const distDir = path.join(projectRoot, "dist");

const LLAMA_CPP_VERSION = "3.22.3";
const NODE_VERSION = process.env.VOXELCHAT_NODE_VERSION ?? "22.22.3";

/**
 * Every platform VoxelChat ships for: the llama.cpp binary package, the Node
 * runtime package, the fallback name in the Node binary archive and the name
 * of the bundled runtime executable.
 */
const PLATFORMS = {
    "linux-x64": {
        llama: "linux-x64",
        node: "node-linux-x64",
        archive: "node-v22.22.3-linux-x64",
        executable: "node",
    },
    "linux-arm64": {
        llama: "linux-arm64",
        node: "node-linux-arm64",
        archive: "node-v22.22.3-linux-arm64",
        executable: "node",
    },
    "darwin-x64": {
        llama: "mac-x64",
        node: "node-darwin-x64",
        archive: "node-v22.22.3-macos-x64",
        executable: "node",
    },
    "darwin-arm64": {
        llama: "mac-arm64-metal",
        node: "node-darwin-arm64",
        archive: "node-v22.22.3-macos-arm64",
        executable: "node",
    },
    "win-x64": {
        llama: "win-x64",
        node: "node-win-x64",
        archive: "node-v22.22.3-win-x64",
        executable: "node.exe",
    },
    "win-arm64": {
        llama: "win-arm64",
        node: "node-win-arm64",
        archive: "node-v22.22.3-win-arm64",
        executable: "node.exe",
    },
};

/** Where the Node binaries live when npm does not carry the platform. */
const NODE_ARCHIVE_BASE = process.env.VOXELCHAT_NODE_ARCHIVE_BASE ?? "https://github.com/yao-pkg/pkg-fetch/releases/download/v3.6";

function currentPlatform() {
    const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch;

    return `${process.platform}-${arch}`;
}

function parseArguments(argv) {
    const options = {platforms: [], includeModel: true};

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === "--platform" || argument === "-p") {
            options.platforms.push(argv[index + 1]);
            index += 1;
        } else if (argument.startsWith("--platform=")) {
            options.platforms.push(argument.slice("--platform=".length));
        } else if (argument === "--no-model") {
            options.includeModel = false;
        }
    }

    if (options.platforms.length === 0) {
        options.platforms.push(currentPlatform());
    }

    if (options.platforms.includes("all")) {
        options.platforms = Object.keys(PLATFORMS);
    }

    for (const platform of options.platforms) {
        if (!PLATFORMS[platform]) {
            throw new Error(
                `Unknown platform "${platform}". Supported: ${Object.keys(PLATFORMS).join(", ")} (or "all").`,
            );
        }
    }

    return options;
}

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {stdio: "inherit", ...options});

        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
            }
        });
    });
}

async function isFile(target) {
    try {
        return (await fs.stat(target)).isFile();
    } catch {
        return false;
    }
}

async function exists(target) {
    try {
        await fs.access(target);

        return true;
    } catch {
        return false;
    }
}

async function copyDirectory(source, destination) {
    await fs.mkdir(destination, {recursive: true});
    await fs.cp(source, destination, {recursive: true});
}

async function copyFile(source, destination) {
    await fs.mkdir(path.dirname(destination), {recursive: true});

    try {
        await fs.copyFile(source, destination, fsConstants.COPYFILE_FICLONE);
    } catch {
        await fs.copyFile(source, destination);
    }
}

async function directorySize(directory) {
    let total = 0;

    const walk = async (current) => {
        const entries = await fs.readdir(current, {withFileTypes: true});

        for (const entry of entries) {
            const full = path.join(current, entry.name);

            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile()) {
                total += (await fs.stat(full)).size;
            }
        }
    };

    await walk(directory);

    return total;
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));

    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const SHELL_LAUNCHER = `#!/usr/bin/env bash
# VoxelChat – double-click this file (or run it) and your browser opens.
set -euo pipefail
cd "$(dirname "$0")"
export VOXELCHAT_BUNDLED=1
exec "./runtime/node" "./src/launcher.js" "$@"
`;

const WINDOWS_LAUNCHER = `@echo off
rem VoxelChat - double-click this file and your browser opens.
cd /d "%~dp0"
set VOXELCHAT_BUNDLED=1
".\\runtime\\node.exe" ".\\src\\launcher.js" %*
if errorlevel 1 pause
`;

const README = `VoxelChat
==========

A local AI chat app that runs entirely on this computer.

  * SmolLM2 1.7B Instruct (Q4_K_M) is already inside this folder – in models/
  * llama.cpp runs on the CPU (and on a GPU when one is available)
  * No account, no API key, no cloud service, no internet connection needed

How to start
------------

  macOS / Linux   double-click "VoxelChat"
  Windows         double-click "VoxelChat.cmd"

Your browser opens automatically at http://localhost:7842.

How to stop
-----------

  Close the terminal window, or press Ctrl+C in it.

Where is my data?
-----------------

  Settings and conversation history live in the "data" folder next to this
  file. Delete that folder to start over.
`;

async function installRuntimeFromNpm(scratch, platform) {
    const spec = PLATFORMS[platform];

    try {
        await run(
            "npm",
            ["install", "--no-audit", "--no-fund", "--silent", "--no-save", "--force", `${spec.node}@${NODE_VERSION}`],
            {cwd: scratch},
        );
    } catch {
        return false;
    }

    const source = path.join(scratch, "node_modules", spec.node, "bin", spec.executable);

    if (!(await exists(source))) return false;

    await fs.copyFile(source, path.join(scratch, "node-binary"));

    return true;
}

async function installRuntimeFromArchive(scratch, platform) {
    const spec = PLATFORMS[platform];
    const url = `${NODE_ARCHIVE_BASE}/${spec.archive}`;

    const response = await fetch(url, {redirect: "follow"});

    if (!response.ok) {
        throw new Error(`Could not download ${spec.archive}: HTTP ${response.status}`);
    }

    const archive = path.join(scratch, "node.tar.gz");

    await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()));

    const checksumResponse = await fetch(`${url}.sha256sum`, {redirect: "follow"});

    if (checksumResponse.ok) {
        const expected = (await checksumResponse.text()).trim().split(/\s+/)[0];
        const {createHash} = await import("node:crypto");
        const {createReadStream} = await import("node:fs");
        const digest = await new Promise((resolve, reject) => {
            const hash = createHash("sha256");
            const stream = createReadStream(archive);

            stream.on("data", (chunk) => hash.update(chunk));
            stream.on("error", reject);
            stream.on("end", () => resolve(hash.digest("hex")));
        });

        if (expected && digest !== expected) {
            throw new Error(`Checksum mismatch for ${spec.archive}`);
        }
    }

    // The published asset is the executable itself – but be forgiving and
    // accept a gzipped tarball too.
    const handle = await fs.open(archive, "r");

    try {
        const magic = Buffer.alloc(2);
        await handle.read(magic, 0, 2, 0);

        if (magic[0] === 0x1f && magic[1] === 0x8b) {
            await run("tar", ["-xzf", archive, "-C", scratch]);

            const preferred = path.join(scratch, "bin", spec.executable);

            if (await isFile(preferred)) {
                await fs.copyFile(preferred, path.join(scratch, "node-binary"));

                return true;
            }

            const entries = await fs.readdir(scratch, {recursive: true, withFileTypes: true});
            const match = entries.find(
                (entry) => entry.isFile() && entry.name === spec.executable && !entry.parentPath.includes("include"),
            );

            if (!match) {
                throw new Error(`The archive ${spec.archive} does not contain ${spec.executable}`);
            }

            await fs.copyFile(path.join(match.parentPath, match.name), path.join(scratch, "node-binary"));

            return true;
        }
    } finally {
        await handle.close();
    }

    await fs.copyFile(archive, path.join(scratch, "node-binary"));

    return true;
}

async function installRuntime(stage, platform) {
    const spec = PLATFORMS[platform];
    const runtimeDir = path.join(stage, "runtime");

    await fs.mkdir(runtimeDir, {recursive: true});

    console.log(`  → fetching the Node ${NODE_VERSION} runtime for ${platform}`);

    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "voxelchat-node-"));

    try {
        let installed = false;

        try {
            installed = await installRuntimeFromNpm(scratch, platform);
        } catch {
            installed = false;
        }

        if (!installed) {
            installed = await installRuntimeFromArchive(scratch, platform);
        }

        if (!installed) {
            throw new Error(`No Node runtime available for ${platform}`);
        }

        const target = path.join(runtimeDir, spec.executable);

        await fs.copyFile(path.join(scratch, "node-binary"), target);
        await fs.chmod(target, 0o755);
    } finally {
        await fs.rm(scratch, {recursive: true, force: true});
    }
}

async function installDependencies(stage, platform) {
    const spec = PLATFORMS[platform];

    const manifest = {
        name: "voxelchat",
        version: "2.0.0",
        private: true,
        type: "module",
        description: "VoxelChat – a local AI chat app with SmolLM2 1.7B",
        license: "MIT",
        dependencies: {
            express: "^4.21.2",
            "node-llama-cpp": `^${LLAMA_CPP_VERSION}`,
            [`@node-llama-cpp/${spec.llama}`]: LLAMA_CPP_VERSION,
        },
    };

    await fs.writeFile(path.join(stage, "package.json"), `${JSON.stringify(manifest, null, 4)}\n`);

    console.log(`  → installing the app dependencies for ${platform}`);

    await run(
        "npm",
        [
            "install",
            "--omit=dev",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--include=optional",
            "--force",
        ],
        {cwd: stage},
    );

    // npm happily installs every llama.cpp flavour. The app only ever loads
    // the one that matches the machine it is running on, so the rest is dead
    // weight in the download.
    const llamaPackages = path.join(stage, "node_modules", "@node-llama-cpp");
    const installed = await fs.readdir(llamaPackages).catch(() => []);

    for (const name of installed) {
        if (name === spec.llama) continue;

        await fs.rm(path.join(llamaPackages, name), {recursive: true, force: true});
    }
}

async function buildPlatform(platform, {includeModel}) {
    const spec = PLATFORMS[platform];
    const stage = path.join(distDir, `VoxelChat-${platform}`);

    console.log(`\n▸ Building VoxelChat for ${platform}`);

    await fs.rm(stage, {recursive: true, force: true});
    await fs.mkdir(stage, {recursive: true});

    await copyDirectory(path.join(projectRoot, "src"), path.join(stage, "src"));
    await copyDirectory(path.join(projectRoot, "public"), path.join(stage, "public"));

    await installDependencies(stage, platform);
    await installRuntime(stage, platform);

    // The weights travel with the app – this is the whole point.
    const modelsDir = path.join(stage, "models");

    await fs.mkdir(modelsDir, {recursive: true});

    if (includeModel) {
        const models = await fs.readdir(path.join(projectRoot, "models")).catch(() => []);

        for (const entry of models) {
            if (!entry.toLowerCase().endsWith(".gguf")) continue;

            console.log(`  → bundling ${entry}`);

            await copyFile(path.join(projectRoot, "models", entry), path.join(modelsDir, entry));
        }
    }

    await fs.writeFile(path.join(stage, "VoxelChat"), SHELL_LAUNCHER);
    await fs.chmod(path.join(stage, "VoxelChat"), 0o755);
    await fs.writeFile(path.join(stage, "VoxelChat.cmd"), WINDOWS_LAUNCHER);
    await fs.writeFile(path.join(stage, "README.txt"), README);

    const size = await directorySize(stage);

    console.log(`  ✔ ${stage} (${formatBytes(size)})`);

    return {platform, stage, size};
}

async function main() {
    const options = parseArguments(process.argv.slice(2));

    console.log("▌  VoxelChat app builder");
    console.log(`   node ${process.version} on ${currentPlatform()}`);

    await fs.mkdir(distDir, {recursive: true});

    const results = [];

    for (const platform of options.platforms) {
        results.push(await buildPlatform(platform, options));
    }

    console.log("\n✔ Done:");

    for (const result of results) {
        console.log(`   ${result.stage} – ${formatBytes(result.size)}`);
    }

    console.log("");
}

main().catch((error) => {
    console.error(`\n✖ ${error.message}\n`);
    process.exit(1);
});
