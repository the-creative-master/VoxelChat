// One-time model cache — NOT run at app runtime.
//
// Fetches SmolLM2 1.7B Instruct (Q4_K_M) once into ./models so that
// `npm start` can load it straight from disk with zero downloading.
// VoxelChat's server itself never touches the network.
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEST = path.join(ROOT, "models", "smollm2-1.7b-instruct-q4_k_m.gguf");
// Pinned upstream revision (HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF, Apache-2.0)
const URL =
  process.env.MODEL_URL ||
  "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/2d4a76a30b4af41ecd395c35725ac11688d4cfe4/smollm2-1.7b-instruct-q4_k_m.gguf";

if (existsSync(DEST) && statSync(DEST).size > 1_000_000_000) {
  console.log(`✅ Already cached: ${DEST} (${(statSync(DEST).size / 1e9).toFixed(2)} GB) — nothing to do.`);
  process.exit(0);
}
mkdirSync(path.dirname(DEST), { recursive: true });
console.log("⬇️  Caching SmolLM2 1.7B Instruct (Q4_K_M, ~1.1 GB) — one time only…");
const res = await fetch(URL, { redirect: "follow" });
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${URL}`);
const total = Number(res.headers.get("content-length") || 0);
let done = 0, last = -1;
const tmp = DEST + ".part";
await pipeline(
  Readable.fromWeb(res.body).on("data", (c) => {
    done += c.length;
    const pct = total ? Math.floor((done / total) * 100) : 0;
    if (pct !== last) { last = pct; process.stdout.write(`\r   ${pct}%  ${(done / 1e6).toFixed(0)} MB`); }
  }),
  createWriteStream(tmp)
);
renameSync(tmp, DEST);
console.log(`\n✅ Cached at ${DEST} (${(statSync(DEST).size / 1e9).toFixed(2)} GB). Now just run: npm start`);
