// CI smoke test: load the cached SmolLM2 1.7B and generate a real reply.
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: path.join(root, "models", "smollm2-1.7b-instruct-q4_k_m.gguf") });
const context = await model.createContext({ contextSize: 2048 });
const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: "You are a helpful assistant. Answer briefly." });
const reply = await session.prompt("Say hello and state your name in one short sentence.", { maxTokens: 64, temperature: 0.7 });
console.log("SMOLLM2 REPLY:", reply);
if (!reply || reply.trim().length < 3) { console.error("❌ Empty reply"); process.exit(1); }
console.log("✅ SmolLM2 1.7B cache loads and generates via node-llama-cpp");
process.exit(0);
