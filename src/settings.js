/**
 * Persisted VoxelChat preferences (local file, never leaves the machine).
 */
import fs from "node:fs/promises";
import path from "node:path";

import {DEFAULT_PERSONA_ID, findPersona} from "./personas.js";

export const DEFAULT_SETTINGS = {
    personaId: DEFAULT_PERSONA_ID,
    systemPrompt: "",
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 512,
    contextSize: 4096,
    gpu: "auto",
    preferredModelId: null,
    theme: "dark",
};

export class SettingsStore {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.filePath = path.join(dataDir, "settings.json");
        this.settings = {...DEFAULT_SETTINGS};
    }

    async load() {
        await fs.mkdir(this.dataDir, {recursive: true});

        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw);

            this.settings = {...DEFAULT_SETTINGS, ...parsed};
        } catch {
            this.settings = {...DEFAULT_SETTINGS};
        }

        if (!this.settings.systemPrompt?.trim()) {
            this.settings.systemPrompt = findPersona(this.settings.personaId).prompt;
        }

        await this.save({});

        return this.settings;
    }

    async save(patch) {
        this.settings = {...this.settings, ...patch};

        if (!this.settings.systemPrompt?.trim()) {
            this.settings.systemPrompt = findPersona(this.settings.personaId).prompt;
        }

        await fs.mkdir(this.dataDir, {recursive: true});
        await fs.writeFile(this.filePath, `${JSON.stringify(this.settings, null, 2)}\n`, "utf8");

        return this.settings;
    }
}
