// VoxelChat launcher — the ONLY command you ever run is `npm start`.
//
// It makes sure dependencies are present (installing them for you if not),
// then boots the server. The AI model itself is downloaded automatically
// by the server on first launch. You never install anything by hand.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

if (!existsSync(path.join(root, "node_modules", "node-llama-cpp"))) {
  console.log("📦 First launch: installing VoxelChat's engine (one time only)…");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error("\n❌ Automatic install failed. Check your internet connection and run `npm start` again.");
    process.exit(1);
  }
  console.log("✅ Engine installed.\n");
}

await import("./server.mjs");
