/**
 * VoxelChat front-end.
 *
 * Talks to the local VoxelChat server over JSON + a streaming POST.
 * Conversations live in localStorage, so nothing ever leaves the machine.
 */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = "voxelchat.conversations.v2";
const ACTIVE_KEY = "voxelchat.active.v2";

const state = {
    status: {phase: "idle"},
    conversations: [],
    activeId: null,
    personas: [],
    settings: {},
    models: {catalog: [], local: [], active: null},
    streaming: false,
    stopped: false,
    abortController: null,
};

/* ────────────────────────────── tiny helpers ─────────────────────────────── */

const uid = () => Math.random().toString(36).slice(2, 10);

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
    if (!bytes) return "";

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));

    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";

    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

/* ────────────────────────────── markdown-lite ────────────────────────────── */

function renderMarkdown(source) {
    const text = String(source ?? "");
    const blocks = [];
    let buffer = [];

    const flush = () => {
        if (buffer.length) {
            blocks.push(`<p>${inline(buffer.join("\n"))}</p>`);
            buffer = [];
        }
    };

    const lines = text.split("\n");

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (line.trim().startsWith("```")) {
            flush();
            const language = line.trim().slice(3).trim();
            const code = [];

            index++;

            while (index < lines.length && !lines[index].trim().startsWith("```")) {
                code.push(lines[index]);
                index++;
            }

            blocks.push(
                `<pre><code data-language="${escapeHtml(language)}">${escapeHtml(code.join("\n"))}</code></pre>`,
            );
            continue;
        }

        if (/^\s*[-*]\s+/.test(line)) {
            flush();
            const items = [];

            while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
                items.push(`<li>${inline(lines[index].replace(/^\s*[-*]\s+/, ""))}</li>`);
                index++;
            }

            index--;
            blocks.push(`<ul>${items.join("")}</ul>`);
            continue;
        }

        if (/^\s*\d+[.)]\s+/.test(line)) {
            flush();
            const items = [];

            while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
                items.push(`<li>${inline(lines[index].replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
                index++;
            }

            index--;
            blocks.push(`<ol>${items.join("")}</ol>`);
            continue;
        }

        if (/^>\s?/.test(line)) {
            flush();
            const quote = [];

            while (index < lines.length && /^>\s?/.test(lines[index])) {
                quote.push(lines[index].replace(/^>\s?/, ""));
                index++;
            }

            index--;
            blocks.push(`<blockquote>${inline(quote.join("\n"))}</blockquote>`);
            continue;
        }

        if (/^#{1,4}\s+/.test(line)) {
            flush();
            const level = line.match(/^#{1,4}/)[0].length;
            const heading = line.replace(/^#{1,4}\s+/, "");

            blocks.push(`<h${Math.min(level + 2, 5)}>${inline(heading)}</h${Math.min(level + 2, 5)}>`);
            continue;
        }

        if (!line.trim()) {
            flush();
            continue;
        }

        buffer.push(line);
    }

    flush();

    return blocks.join("");
}

function inline(text) {
    let html = escapeHtml(text);

    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    return html.replace(/\n/g, "<br />");
}

/* ────────────────────────────── conversations ────────────────────────────── */

function loadConversations() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        state.conversations = raw ? JSON.parse(raw) : [];
    } catch {
        state.conversations = [];
    }

    state.activeId = localStorage.getItem(ACTIVE_KEY) || state.conversations[0]?.id || null;
}

function saveConversations() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations));
        localStorage.setItem(ACTIVE_KEY, state.activeId ?? "");
    } catch {
        /* storage full or blocked – the app still works */
    }
}

function activeConversation() {
    return state.conversations.find((conversation) => conversation.id === state.activeId) ?? null;
}

function createConversation() {
    const conversation = {
        id: uid(),
        title: "New chat",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    state.conversations.unshift(conversation);
    state.activeId = conversation.id;
    saveConversations();

    return conversation;
}

function ensureConversation() {
    let conversation = activeConversation();

    if (!conversation) {
        conversation = createConversation();
    }

    return conversation;
}

function conversationTitle(conversation) {
    if (conversation.title !== "New chat") return conversation.title;

    const firstUser = conversation.messages.find((message) => message.role === "user");

    if (!firstUser) return "New chat";

    const title = firstUser.content.trim().replace(/\s+/g, " ").slice(0, 42);

    return title.length ? title : "New chat";
}

/* ────────────────────────────────── boot ────────────────────────────────── */

function setBootStage(text) {
    $("#boot-stage").textContent = text;
}

function setBootProgress(ratio) {
    const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    const bar = $("#boot-bar");

    bar.style.width = `${percent}%`;
    bar.parentElement.setAttribute("aria-valuenow", String(percent));
}

function setBootDetail(text) {
    $("#boot-detail").textContent = text ?? "";
}

async function pollStatus() {
    try {
        const response = await fetch("/api/status", {cache: "no-store"});

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const status = await response.json();

        applyStatus(status);

        return status;
    } catch {
        // Only the boot screen cares about this – once the chat is up, a
        // hiccup should not change anything on screen.
        if ($("#app").classList.contains("is-hidden")) {
            setBootStage("Waiting for the local server…");
        }

        return null;
    }
}

/**
 * The server tells us which version it is. If it is not the version this
 * page was built from, the page reloads itself – nobody should ever talk to
 * a new server with an old front-end.
 */
function checkVersion(version) {
    if (!version) return;

    const meta = document.querySelector('meta[name="voxelchat-version"]');
    const pageVersion = meta?.content;

    if (!pageVersion || pageVersion === version) return;

    if (sessionStorage.getItem("voxelchat.reloaded") === version) return;

    sessionStorage.setItem("voxelchat.reloaded", version);
    location.reload();
}

function applyStatus(status) {
    checkVersion(status.version);

    const previousPhase = state.status.phase;
    const signature = `${status.phase}|${status.stage}|${status.progress}|${status.error ?? ""}|${
        status.model?.id ?? ""
    }|${status.contextSize}|${status.threads}`;

    state.status = status;

    // Polling runs every second – only redraw when something actually moved.
    if (signature === lastStatusSignature) return;

    lastStatusSignature = signature;

    const phase = status.phase ?? "idle";

    if (phase === "ready") {
        setBootProgress(1);
        setBootStage("Ready");
        setBootDetail("");

        if (previousPhase !== "ready") {
            setTimeout(() => {
                $("#boot").classList.add("is-done");
                $("#app").classList.remove("is-hidden");
                $("#input")?.focus();
            }, 420);
        }

        updateModelChip();
        updateSubtitle();
        return;
    }

    if (phase === "error") {
        setBootStage("Something went wrong");
        setBootDetail(status.error ?? "Unknown error");
        $("#boot-retry").classList.remove("is-hidden");
        $("#boot-bar").style.background = "var(--danger)";
        return;
    }

    if (phase === "loading") {
        setBootStage(status.stage ?? "Loading the model…");
        setBootProgress(status.progress ?? 0);
        setBootDetail("");
        return;
    }

    if (phase === "booting") {
        setBootStage(status.stage ?? "Waking up llama.cpp…");
    }
}

/* ───────────────────────────────── chat UI ──────────────────────────────── */

function renderChatList() {
    const list = $("#chat-list");
    const empty = $("#chat-list-empty");

    list.innerHTML = "";
    empty.classList.toggle("is-hidden", state.conversations.length > 0);

    for (const conversation of state.conversations) {
        const item = document.createElement("li");
        item.className = `chat-list__item${conversation.id === state.activeId ? " is-active" : ""}`;
        item.innerHTML = `
            <span>${escapeHtml(conversationTitle(conversation))}</span>
            <button title="Delete conversation" aria-label="Delete conversation">✕</button>
        `;

        item.addEventListener("click", (event) => {
            if (event.target.tagName === "BUTTON") {
                event.stopPropagation();
                deleteConversation(conversation.id);
                return;
            }

            state.activeId = conversation.id;
            saveConversations();
            renderChatList();
            renderMessages();
        });

        list.append(item);
    }
}

function deleteConversation(id) {
    state.conversations = state.conversations.filter((conversation) => conversation.id !== id);

    if (state.activeId === id) {
        state.activeId = state.conversations[0]?.id ?? null;
    }

    saveConversations();
    renderChatList();
    renderMessages();
}

function renderMessages() {
    const container = $("#messages");
    const conversation = activeConversation();

    container.querySelectorAll(".message, .messages__inner").forEach((node) => node.remove());
    $("#empty-state").classList.toggle("is-hidden", Boolean(conversation?.messages?.length));

    if (!conversation) {
        $("#chat-title").textContent = "New chat";
        updateSubtitle();
        return;
    }

    const inner = document.createElement("div");
    inner.className = "messages__inner";

    for (const message of conversation.messages) {
        inner.append(buildMessageNode(message));
    }

    container.append(inner);
    scrollToBottom();
}

function buildMessageNode(message) {
    const node = document.createElement("article");
    node.className = `message message--${message.role}`;

    const avatar = document.createElement("div");
    avatar.className = "message__avatar";
    avatar.textContent = message.role === "user" ? "🧑" : "▚";

    const body = document.createElement("div");
    body.className = "message__body";

    const meta = document.createElement("div");
    meta.className = "message__meta";
    meta.innerHTML = `<strong>${message.role === "user" ? "You" : "Voxel"}</strong>${
        message.stats ? `<span>${message.stats.tokens} tok · ${message.stats.tokensPerSecond} tok/s</span>` : ""
    }`;

    const content = document.createElement("div");
    content.className = "message__content";

    if (message.streaming && !message.content) {
        content.classList.add("message__content--thinking");
        content.innerHTML = '<span class="thinking-dots" aria-label="Thinking"><i></i><i></i><i></i></span>';
    } else {
        content.innerHTML = renderMarkdown(message.content);
    }

    const actions = document.createElement("div");
    actions.className = "message__actions";

    const copy = document.createElement("button");
    copy.className = "message__action";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            copy.textContent = "Copied ✓";
            setTimeout(() => {
                copy.textContent = "Copy";
            }, 1400);
        } catch {
            copy.textContent = "Press ⌘C";
        }
    });

    actions.append(copy);

    if (message.role === "assistant") {
        const regenerate = document.createElement("button");
        regenerate.className = "message__action";
        regenerate.textContent = "Regenerate";
        regenerate.addEventListener("click", () => regenerateLast());
        actions.append(regenerate);
    }

    body.append(meta, content, actions);
    node.append(avatar, body);

    return node;
}

function scrollToBottom(smooth = true) {
    const container = $("#messages");

    if (typeof container.scrollTo === "function") {
        container.scrollTo({top: container.scrollHeight, behavior: smooth ? "smooth" : "auto"});
    } else {
        container.scrollTop = container.scrollHeight;
    }
}

function updateSubtitle() {
    const status = state.status;
    const model = status.model;

    $("#chat-subtitle").textContent = model
        ? `${model.label} · ${model.quant} · ${status.device ?? "CPU"}`
        : "SmolLM2 · warming up";
}

function updateModelChip() {
    const model = state.status.model;

    $("#model-name").textContent = model?.label ?? "SmolLM2";
    $("#model-meta").textContent = model
        ? `${model.params} · ${model.quant} · ${formatBytes(model.sizeBytes)}`
        : "preparing…";

    const emptyTitle = $("#empty-title");

    if (emptyTitle && model) {
        const shortName = model.label.split(" ")[0];

        emptyTitle.textContent = `Hey! I'm ${shortName}, running on your own machine.`;
    }
}

/* ──────────────────────────────── streaming ──────────────────────────────── */

async function sendMessage(text) {
    if (state.streaming || !text.trim()) return;

    const conversation = ensureConversation();

    conversation.messages.push({role: "user", content: text});

    if (conversation.title === "New chat") {
        conversation.title = conversationTitle(conversation);
    }

    conversation.updatedAt = Date.now();
    saveConversations();
    renderChatList();

    const assistantMessage = {role: "assistant", content: "", streaming: true};

    conversation.messages.push(assistantMessage);
    renderMessages();

    setStreaming(true);

    state.stopped = false;
    state.abortController = new AbortController();

    const startedAt = Date.now();
    let received = 0;
    const ticker = setInterval(() => {
        const seconds = (Date.now() - startedAt) / 1000;

        if (seconds > 0.4) {
            const estimate = (received / 4 / seconds).toFixed(1);

            $("#stat-speed").textContent = `${estimate} tok/s · live`;
        }
    }, 500);

    const payload = {
        messages: conversation.messages
            .filter((message) => !message.streaming)
            .map(({role, content}) => ({role, content})),
    };

    // The whole answer in one response – the fallback when streaming does not
    // make it through.
    const oneShot = async () => {
        const fallback = await fetch("/api/chat", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({...payload, stream: false}),
            signal: state.abortController.signal,
        });

        const result = await fallback.json();

        assistantMessage.content = result.reply ?? "";
        assistantMessage.stats = result.stats ?? null;
        assistantMessage.streaming = false;

        renderMessages();
    };

    try {
        let response;

        try {
            response = await fetch("/api/chat", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
                signal: state.abortController.signal,
            });
        } catch {
            // The streaming request never made it (a proxy that refuses to
            // pass a long response through, a dropped connection).
            await oneShot();

            return;
        }

        if (!response.ok || !response.body) {
            const fallback = await response.json().catch(() => ({}));
            throw new Error(fallback.error || `The model returned ${response.status}.`);
        }

        // A stream that stays completely silent for this long is being held
        // back somewhere – drop it and ask for the whole answer instead.
        const controller = state.abortController;
        const watchdog = setTimeout(() => {
            if (received === 0) controller?.abort();
        }, 20_000);

        await readStream(response.body, (event, data) => {
            if (event === "delta") {
                assistantMessage.content += data.text;
                received += data.text.length;
                updateStreamingNode(assistantMessage);
            }

            if (event === "done") {
                // The server always sends the finished reply along. If the
                // stream was cut short (a proxy that buffers, a flaky network)
                // the complete answer is still here.
                if (data.reply && data.reply.length > assistantMessage.content.length) {
                    assistantMessage.content = data.reply;
                    updateStreamingNode(assistantMessage);
                }

                assistantMessage.stats = data.stats;
                assistantMessage.streaming = false;

                if (data.stats) {
                    $("#stat-speed").textContent = `${data.stats.tokensPerSecond} tok/s · ${formatTime(
                        (data.stats.elapsedMs ?? 0) / 1000,
                    )}`;

                    if (data.stats.contextUsed != null && data.stats.contextSize) {
                        const used = Math.round((data.stats.contextUsed / data.stats.contextSize) * 100);

                        $("#stat-context").textContent = `${data.stats.contextUsed}/${data.stats.contextSize} ctx`;
                        $("#stat-context").title = `Context window ${used}% used`;
                    }
                }

                if (data.stopped) {
                    assistantMessage.content += "\n\n_(stopped)_";
                }
            }

            if (event === "error") {
                assistantMessage.streaming = false;
                assistantMessage.content = `⚠️ ${data.message}`;
            }
        });

        clearTimeout(watchdog);
    } catch (error) {
        if (error.name === "AbortError") {
            // Aborted by the watchdog – nothing arrived, so try once more
            // without streaming.
            if (received === 0 && !state.stopped) {
                try {
                    await oneShot();
                } catch {
                    assistantMessage.content = "⚠️ The model did not answer.";
                    assistantMessage.streaming = false;
                }
            }
        } else {
            assistantMessage.content = `⚠️ ${error.message}`;
            assistantMessage.streaming = false;
        }
    } finally {
        clearInterval(ticker);
        assistantMessage.streaming = false;
        conversation.updatedAt = Date.now();
        saveConversations();
        setStreaming(false);
        renderMessages();
    }
}

async function readStream(body, onEvent) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const {value, done} = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, {stream: true});

        let index;

        while ((index = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);

            let event = "message";
            const dataLines = [];

            for (const line of raw.split("\n")) {
                if (line.startsWith("event:")) {
                    event = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trim());
                }
            }

            if (!dataLines.length) continue;

            try {
                onEvent(event, JSON.parse(dataLines.join("\n")));
            } catch {
                /* ignore malformed frame */
            }
        }
    }
}

let streamingFrame = null;

function updateStreamingNode(message) {
    if (streamingFrame) return;

    streamingFrame = requestAnimationFrame(() => {
        streamingFrame = null;

        const nodes = $$("#messages .message--assistant .message__content");
        const last = nodes[nodes.length - 1];

        if (!last) return;

        last.classList.remove("message__content--thinking");
        last.innerHTML = `${renderMarkdown(message.content)}<span class="caret"></span>`;
        scrollToBottom(false);
    });
}

function setStreaming(active) {
    state.streaming = active;
    $("#stop-button").classList.toggle("is-hidden", !active);
    $("#send-button").classList.toggle("is-hidden", active);
}

async function regenerateLast() {
    const conversation = activeConversation();

    if (!conversation || state.streaming) return;

    const lastAssistant = [...conversation.messages].reverse().find((message) => message.role === "assistant");

    if (!lastAssistant) return;

    conversation.messages = conversation.messages.slice(0, conversation.messages.indexOf(lastAssistant));
    saveConversations();
    renderMessages();

    const lastUser = [...conversation.messages].reverse().find((message) => message.role === "user");

    if (lastUser) {
        conversation.messages = conversation.messages.slice(0, conversation.messages.indexOf(lastUser));
        await sendMessage(lastUser.content);
    }
}

/* ──────────────────────────────── settings ──────────────────────────────── */

async function loadSettings() {
    const response = await fetch("/api/settings", {cache: "no-store"});
    const settings = await response.json();

    state.settings = settings;

    $("#system-prompt").value = settings.systemPrompt ?? "";
    $("#temperature").value = settings.temperature;
    $("#top-p").value = settings.topP;
    $("#max-tokens").value = settings.maxTokens;
    $("#context-size").value = settings.contextSize;

    syncSettingOutputs();
    applyTheme(settings.theme ?? "dark");
    applyPersona(settings.personaId);
}

function syncSettingOutputs() {
    $("#temperature-value").textContent = Number($("#temperature").value).toFixed(2);
    $("#top-p-value").textContent = Number($("#top-p").value).toFixed(2);
    $("#max-tokens-value").textContent = $("#max-tokens").value;
    $("#context-size-value").textContent = `${$("#context-size").value} tok`;
}

async function saveSettings(patch) {
    state.settings = {...state.settings, ...patch};

    const response = await fetch("/api/settings", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(patch),
    });

    state.settings = await response.json();
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    $$("[data-theme-choice]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.themeChoice === theme);
    });
}

async function loadPersonas() {
    const response = await fetch("/api/personas", {cache: "no-store"});
    const {personas} = await response.json();

    state.personas = personas;

    const grid = $("#persona-grid");
    grid.innerHTML = "";

    for (const persona of personas) {
        const card = document.createElement("button");
        card.className = "persona-card";
        card.dataset.personaId = persona.id;
        card.innerHTML = `<strong>${persona.emoji} ${escapeHtml(persona.name)}</strong><small>${escapeHtml(
            persona.description,
        )}</small>`;

        card.addEventListener("click", async () => {
            applyPersona(persona.id);
            await saveSettings({personaId: persona.id, systemPrompt: persona.prompt});
            $("#system-prompt").value = persona.prompt;
        });

        grid.append(card);
    }

    applyPersona(state.settings.personaId);
}

function applyPersona(personaId) {
    const persona = state.personas.find((item) => item.id === personaId) ?? state.personas[0];

    $$("[data-persona-id]").forEach((card) => {
        card.classList.toggle("is-active", card.dataset.personaId === personaId);
    });

    if (persona) {
        $("#persona-emoji").textContent = persona.emoji;
        $("#persona-name").textContent = persona.name;
    }
}

/* ───────────────────────────────── models ──────────────────────────────── */

async function loadModels() {
    const response = await fetch("/api/models", {cache: "no-store"});
    const models = await response.json();

    state.models = models;
    renderModels();
}

function renderModels() {
    const list = $("#model-list");
    list.innerHTML = "";

    const merged = new Map();
    const localModels = state.models.local ?? [];

    for (const entry of localModels) {
        merged.set(entry.id, {...entry, cached: true});
    }

    for (const entry of state.models.catalog ?? []) {
        if (merged.has(entry.id)) continue;

        // A cached file counts as the catalog model when it is the same size
        // class (the file name may differ, e.g. a hand-renamed download).
        const localMatch = localModels.find(
            (local) => String(local.params ?? "").toLowerCase() === String(entry.params ?? "").toLowerCase(),
        );

        if (localMatch) {
            merged.set(entry.id, {...localMatch, label: entry.label, cached: true});
            continue;
        }

        merged.set(entry.id, {...entry, cached: false});
    }

    for (const entry of merged.values()) {
        const item = document.createElement("div");
        item.className = `model-item${entry.id === state.models.active ? " is-active" : ""}`;

        const body = document.createElement("div");
        body.className = "model-item__body";
        body.innerHTML = `<strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(
            entry.params ?? "",
        )} · ${escapeHtml(entry.quant ?? "")} · ${escapeHtml(entry.sizeLabel ?? formatBytes(entry.sizeBytes))}</small>`;

        const actions = document.createElement("div");
        actions.className = "model-item__actions";

        if (entry.id === state.models.active) {
            const badge = document.createElement("span");
            badge.className = "badge badge--active";
            badge.textContent = "in use";
            actions.append(badge);
        } else if (entry.cached) {
            const use = document.createElement("button");
            use.className = "btn";
            use.style.padding = "6px 12px";
            use.style.fontSize = "12.5px";
            use.textContent = "Use";
            use.addEventListener("click", async () => {
                use.disabled = true;
                await fetch("/api/models/activate", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({modelId: entry.id}),
                });
                await loadModels();
                await pollStatus();
            });
            actions.append(use);
        } else {
            const badge = document.createElement("span");
            badge.className = "badge";
            badge.textContent = "not installed";
            actions.append(badge);
        }

        item.append(body, actions);
        list.append(item);
    }
}

/* ──────────────────────────────── wiring ───────────────────────────────── */

function openSettings() {
    $("#settings-panel").classList.remove("is-hidden");
    $("#settings-scrim").classList.remove("is-hidden");
    loadModels();
}

function closeSettings() {
    $("#settings-panel").classList.add("is-hidden");
    $("#settings-scrim").classList.add("is-hidden");
}

function wireEvents() {
    const input = $("#input");

    input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    });

    $("#send-button").addEventListener("click", submit);

    $("#stop-button").addEventListener("click", async () => {
        state.stopped = true;
        await fetch("/api/chat/stop", {method: "POST"});
        state.abortController?.abort();
    });

    $("#new-chat").addEventListener("click", () => {
        createConversation();
        renderChatList();
        renderMessages();
        input.focus();
    });

    $("#open-settings").addEventListener("click", openSettings);
    $("#close-settings").addEventListener("click", closeSettings);
    $("#settings-scrim").addEventListener("click", closeSettings);
    $("#model-button").addEventListener("click", openSettings);
    $("#persona-button").addEventListener("click", openSettings);

    const openFolder = () => fetch("/api/models/folder/open", {method: "POST"});

    $("#open-models-folder").addEventListener("click", openFolder);
    $("#open-models-folder-2").addEventListener("click", openFolder);

    $("#toggle-sidebar").addEventListener("click", () => $("#sidebar").classList.add("is-open"));
    $("#close-sidebar").addEventListener("click", () => $("#sidebar").classList.remove("is-open"));

    $$(".suggestion").forEach((button) => {
        button.addEventListener("click", () => {
            input.value = button.dataset.prompt ?? "";
            input.dispatchEvent(new Event("input"));
            input.focus();
        });
    });

    for (const [selector, key] of [
        ["#temperature", "temperature"],
        ["#top-p", "topP"],
        ["#max-tokens", "maxTokens"],
        ["#context-size", "contextSize"],
    ]) {
        const element = $(selector);

        element.addEventListener("input", () => syncSettingOutputs());
        element.addEventListener("change", async () => {
            const value = Number(element.value);

            await saveSettings({[key]: value});
            syncSettingOutputs();
        });
    }

    $("#system-prompt").addEventListener("change", async () => {
        await saveSettings({systemPrompt: $("#system-prompt").value});
    });

    $$("[data-theme-choice]").forEach((button) => {
        button.addEventListener("click", async () => {
            applyTheme(button.dataset.themeChoice);
            await saveSettings({theme: button.dataset.themeChoice});
        });
    });

    $("#clear-chats").addEventListener("click", () => {
        if (!window.confirm("Delete every conversation stored in this browser?")) return;

        state.conversations = [];
        state.activeId = null;
        saveConversations();
        renderChatList();
        renderMessages();
        createConversation();
        renderChatList();
        renderMessages();
    });

    $("#boot-retry").addEventListener("click", async () => {
        $("#boot-retry").classList.add("is-hidden");
        $("#boot-bar").style.background = "";
        setBootStage("Retrying…");
        setBootProgress(0);

        await fetch("/api/boot", {method: "POST"}).catch(() => {});
        await pollStatus();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeSettings();
            $("#sidebar").classList.remove("is-open");
        }
    });
}

function flashComposer(message) {
    const hint = $("#composer-hint");
    const original = hint.textContent;

    hint.textContent = message;
    hint.style.color = "var(--danger)";

    setTimeout(() => {
        hint.textContent = original;
        hint.style.color = "";
    }, 2600);
}

async function submit() {
    const input = $("#input");
    const text = input.value;

    if (!text.trim()) return;

    if (state.status.phase !== "ready") {
        // The status may be out of date – ask the server before giving up.
        await pollStatus();

        if (state.status.phase !== "ready") {
            flashComposer(
                state.status.phase === "error"
                    ? "The model could not be loaded – press Retry on the boot screen."
                    : "Still waking up the model – one second!",
            );

            return;
        }
    }

    input.value = "";
    input.style.height = "auto";
    sendMessage(text);
}

let statusPollTimer = null;
let lastStatusSignature = "";

/**
 * The status is polled instead of streamed.
 *
 * A long lived connection is the one thing a proxy in front of the app can
 * refuse to pass through, and a refused stream would also hold up the very
 * request that answers a question. Short, complete requests are boring – and
 * boring always works.
 */
function startStatusPolling() {
    if (statusPollTimer) return;

    const tick = async () => {
        try {
            const response = await fetch("/api/status", {cache: "no-store"});

            if (!response.ok) return;

            const status = await response.json();

            applyStatus(status);
        } catch {
            // The server is not reachable right now – say so and try again.
            setBootStage("Waiting for the local server…");
        }
    };

    statusPollTimer = setInterval(tick, 1200);

    tick();
}

function stopStatusPolling() {
    if (!statusPollTimer) return;

    clearInterval(statusPollTimer);
    statusPollTimer = null;
}

async function init() {
    loadConversations();
    renderChatList();
    renderMessages();
    wireEvents();
    startStatusPolling();

    await Promise.allSettled([loadSettings(), loadPersonas(), loadModels()]);

    renderChatList();
    renderMessages();

    window.setInterval(() => {
        if (state.status.phase === "ready") {
            loadModels();
        }
    }, 8000);
}

init();
