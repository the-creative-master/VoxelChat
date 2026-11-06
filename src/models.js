import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Where GGUF files are kept. Ignored by git. */
export const MODELS_DIR = process.env.VOXELCHAT_MODELS_DIR || path.join(ROOT_DIR, "models");

/**
 * Point this at a local .gguf file to skip the download entirely.
 * Useful on a slow connection or when running fully offline.
 */
export const MODEL_PATH_OVERRIDE = process.env.VOXELCHAT_MODEL_PATH || null;

/**
 * The model catalog. Only SmolLM2 1.7B Instruct is supported for now.
 * Adding another model means adding an entry here and enabling it in the UI.
 */
export const MODELS = [
    {
        id: "smollm2-1.7b-instruct-q4_k_m",
        name: "SmolLM2 1.7B Instruct",
        family: "SmolLM2",
        parameters: "1.7B",
        quantization: "Q4_K_M",
        approxSize: "1.06 GB",
        contextSize: 4096,
        fileName: "smollm2-1.7b-instruct-q4_k_m.gguf",
        url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf",
        description: "A small, fast instruction-tuned model that runs comfortably on a laptop CPU.",
        enabled: true
    }
];

export const ACTIVE_MODEL = MODELS.find(model => model.enabled) ?? MODELS[0];

/** Model metadata that is safe to send to the browser. */
export function getModelInfo() {
    const {id, name, family, parameters, quantization, approxSize, contextSize, description} = ACTIVE_MODEL;
    return {id, name, family, parameters, quantization, approxSize, contextSize, description};
}
