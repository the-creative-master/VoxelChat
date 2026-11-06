// Copies the Transformers.js runtime + its ONNX Runtime Web WASM binaries into
// smol/vendor/ so the app runs offline (no CDN round-trip on load).
//
//   npm i && npm run vendor

import { cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pkgDir = join(root, "node_modules", "@huggingface", "transformers");

if (!existsSync(pkgDir)) {
  console.error("✗ @huggingface/transformers is not installed — run `npm i` first.");
  process.exit(1);
}

const pkg = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8"));
const out = join(root, "smol", "vendor");

await mkdir(join(out, "transformers"), { recursive: true });
await mkdir(join(out, "ort"), { recursive: true });

const files = [
  ["dist/transformers.web.min.js", "transformers/transformers.web.min.js"],
  // jsep build = wasm + WebGPU/JSEP kernels (matches the CDN build transformers.js uses)
  ["dist/ort-wasm-simd-threaded.jsep.wasm", "ort/ort-wasm-simd-threaded.jsep.wasm"],
  ["dist/ort-wasm-simd-threaded.jsep.mjs", "ort/ort-wasm-simd-threaded.jsep.mjs"],
];

for (const [from, to] of files) {
  await cp(join(pkgDir, from), join(out, to));
  console.log("✓", to);
}

await writeFile(
  join(out, "versions.json"),
  JSON.stringify({ transformers: pkg.version }, null, 2) + "\n"
);
console.log(`✓ vendored @huggingface/transformers ${pkg.version}`);
