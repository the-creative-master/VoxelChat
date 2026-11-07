/* VoxelChat — browser client. Talks to the local Express server only. */

const STORAGE_KEY = "voxelchat.state.v2";

const els = {
  conversationList: document.getElementById("conversationList"),
  emptyList: document.getElementById("emptyList"),
  newChat: document.getElementById("newChat"),
  messages: document.getElementById("messages"),
  welcome: document.getElementById("welcome"),
  welcomeNote: document.getElementById("welcomeNote"),
  scrollArea: document.getElementById("scrollArea"),
  composer: document.getElementById("composer"),
  prompt: document.getElementById("prompt"),
  sendBtn: document.getElementById("sendBtn"),
  stopBtn: document.getElementById("stopBtn"),
  topbarTitle: document.getElementById("topbarTitle"),
  statusPill: document.getElementById("statusPill"),
  statusPillText: document.getElementById("statusPillText"),
  modelDot: document.getElementById("modelDot"),
  modelName: document.getElementById("modelName"),
  modelMeta: document.getElementById("modelMeta"),
  modelStatus: document.getElementById("modelStatus"),
  progress: document.getElementById("progress"),
  progressBar: document.getElementById("progressBar"),
  sidebar: document.getElementById("sidebar"),
  openSidebar: document.getElementById("openSidebar"),
  closeSidebar: document.getElementById("closeSidebar"),
  scrim: document.getElementById("scrim"),
  settingsDialog: document.getElementById("settingsDialog"),
  openSettings: document.getElementById("openSettings"),
  systemPrompt: document.getElementById("systemPrompt"),
  systemPromptCount: document.getElementById("systemPromptCount"),
  resetSystemPrompt: document.getElementById("resetSystemPrompt"),
  clearAll: document.getElementById("clearAll"),
  specName: document.getElementById("specName"),
  specParams: document.getElementById("specParams"),
  specQuant: document.getElementById("specQuant"),
  specContext: document.getElementById("specContext"),
  specDevice: document.getElementById("specDevice"),
  specActive: document.getElementById("specActive"),
  modelList: document.getElementById("modelList"),
  cacheUsage: document.getElementById("cacheUsage"),
  unloadModel: document.getElementById("unloadModel"),
  specMemory: document.getElementById("specMemory"),
  toast: document.getElementById("toast")
};

/* ------------------------------- app state -------------------------------- */

const state = {
  conversations: [],
  activeId: null,
  systemPrompt: "",
  defaultSystemPrompt: "",
  model: null,
  models: [],
  activeModelId: null,
  cacheLabel: "",
  aborter: null,
  streaming: false
};

/* ------------------------------- persistence ------------------------------ */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.conversations)) state.conversations = parsed.conversations;
    if (typeof parsed.systemPrompt === "string") state.systemPrompt = parsed.systemPrompt;
    if (typeof parsed.activeId === "string") state.activeId = parsed.activeId;
  } catch {
    /* Corrupt storage: start clean rather than crash. */
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      conversations: state.conversations.slice(0, 60),
      systemPrompt: state.systemPrompt,
      activeId: state.activeId
    }));
  } catch {
    /* Quota or private mode: chatting still works, just without persistence. */
  }
}

/* --------------------------------- helpers -------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function activeConversation() {
  return state.conversations.find(conversation => conversation.id === state.activeId) ?? null;
}

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 1 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function scrollToBottom(force = false) {
  if (!force) {
    const {scrollTop, scrollHeight, clientHeight} = els.scrollArea;
    if (scrollHeight - scrollTop - clientHeight > 220) return;
  }
  els.scrollArea.scrollTop = els.scrollArea.scrollHeight;
}

/* ------------------------------ conversation UI --------------------------- */

function renderSidebar() {
  els.conversationList.replaceChildren();
  els.emptyList.hidden = state.conversations.length > 0;

  for (const conversation of state.conversations) {
    const li = document.createElement("li");
    li.className = "conversation-item" + (conversation.id === state.activeId ? " active" : "");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "conversation-open";
    open.textContent = conversation.title || "New chat";
    open.title = conversation.title || "New chat";
    open.addEventListener("click", () => {
      if (state.streaming) return toast("Stop the current response first.");
      selectConversation(conversation.id);
      closeSidebar();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "conversation-delete";
    remove.textContent = "✕";
    remove.title = "Delete conversation";
    remove.setAttribute("aria-label", `Delete ${conversation.title || "conversation"}`);
    remove.addEventListener("click", event => {
      event.stopPropagation();
      deleteConversation(conversation.id);
    });

    li.append(open, remove);
    els.conversationList.append(li);
  }
}

function renderConversation() {
  const conversation = activeConversation();
  const hasMessages = conversation != null && conversation.messages.length > 0;

  els.messages.replaceChildren();
  els.welcome.hidden = hasMessages;
  els.topbarTitle.textContent = conversation?.title || "New chat";

  if (!hasMessages) {
    renderWelcomeNote();
    return;
  }

  for (const message of conversation.messages) {
    els.messages.append(buildMessageElement(message.role, message.content, {streaming: false}));
  }

  scrollToBottom(true);
}

function buildMessageElement(role, content, {streaming = false} = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}` + (streaming ? " streaming" : "");

  const label = document.createElement("div");
  label.className = "message-role";
  label.textContent = role === "user" ? "You" : role === "error" ? "Error" : "VoxelChat";

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = content;

  wrapper.append(label, body);

  if (role === "assistant" && content) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-btn";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(body.textContent);
        copy.textContent = "Copied";
        setTimeout(() => (copy.textContent = "Copy"), 1400);
      } catch {
        toast("Could not access the clipboard.");
      }
    });

    actions.append(copy);
    wrapper.append(actions);
  }

  return wrapper;
}

function renderWelcomeNote() {
  const {phase, message, downloadedBytes, totalBytes} = statusOf();
  if (phase === "downloading") {
    const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
    els.welcomeNote.textContent = `Downloading the model — ${formatBytes(downloadedBytes)} of ${formatBytes(totalBytes)} (${pct}%). The first message will wait for this.`;
  } else if (phase === "loading") {
    els.welcomeNote.textContent = "Warming up the model. This takes a few seconds the first time.";
  } else if (phase === "error") {
    els.welcomeNote.textContent = `Model unavailable: ${message} Check the terminal for details.`;
  } else if (phase === "ready") {
    els.welcomeNote.textContent = "";
  } else {
    els.welcomeNote.textContent = "Preparing the model…";
  }
}

function selectConversation(id) {
  state.activeId = id;
  saveState();
  renderSidebar();
  renderConversation();
}

function startNewChat({focus = true} = {}) {
  if (state.streaming) {
    toast("Stop the current response first.");
    return;
  }

  const conversation = {id: uid(), title: "", messages: [], createdAt: Date.now()};
  state.conversations.unshift(conversation);
  state.activeId = conversation.id;
  saveState();
  renderSidebar();
  renderConversation();
  if (focus) els.prompt.focus();
}

function deleteConversation(id) {
  if (state.streaming && id === state.activeId) {
    toast("Stop the current response first.");
    return;
  }

  const index = state.conversations.findIndex(conversation => conversation.id === id);
  if (index === -1) return;

  state.conversations.splice(index, 1);

  if (state.activeId === id) {
    state.activeId = state.conversations[0]?.id ?? null;
    if (state.activeId == null) startNewChat({focus: false});
  }

  saveState();
  renderSidebar();
  renderConversation();
}

function titleFor(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 46 ? `${cleaned.slice(0, 46).trimEnd()}…` : cleaned || "New chat";
}

/* -------------------------------- composer -------------------------------- */

function autoGrow() {
  els.prompt.style.height = "auto";
  els.prompt.style.height = `${Math.min(els.prompt.scrollHeight, 190)}px`;
}

function setStreaming(isStreaming) {
  state.streaming = isStreaming;
  els.stopBtn.hidden = !isStreaming;
  els.sendBtn.disabled = isStreaming;
  els.prompt.disabled = false;
}

/* --------------------------------- status --------------------------------- */

function statusOf() {
  return state.status ?? {phase: "idle", message: "Connecting to the server…", downloadedBytes: 0, totalBytes: 0};
}

function applyStatus(payload) {
  if (Array.isArray(payload?.models)) {
    state.models = payload.models;
    state.activeModelId = payload.activeModelId ?? null;
    renderModels();
  }

  // The side bar shows the model that is actually loaded, not just the catalog default.
  const active = state.models.find(model => model.id === state.activeModelId)
    ?? state.models.find(model => model.isDefault)
    ?? state.models[0];

  if (active) {
    state.model = active;
    els.modelName.textContent = active.name;
    els.modelMeta.textContent = [active.quantization, active.approxSize, "local"].filter(Boolean).join(" · ");
    els.specName.textContent = active.name;
    els.specParams.textContent = active.parameters ?? "—";
    els.specQuant.textContent = active.quantization ?? "—";
    els.specContext.textContent = `${active.contextSize} tokens`;
  }

  els.specActive.textContent = state.activeModelId != null && !statusOf().phase.match(/idle|error/)
    ? "yes"
    : "no";

  if (payload?.status) state.status = payload.status;

  const status = statusOf();
  const phase = status.phase;

  els.modelDot.dataset.phase = phase;
  els.statusPill.dataset.phase = phase;

  if (phase === "ready") {
    els.statusPillText.textContent = "Model ready";
    els.modelStatus.textContent = `Ready on ${status.device ?? "CPU"}.`;
    els.progress.hidden = true;
  } else if (phase === "downloading") {
    const pct = status.totalBytes > 0 ? Math.round((status.downloadedBytes / status.totalBytes) * 100) : 0;
    els.statusPillText.textContent = `Downloading ${pct}%`;
    els.modelStatus.textContent = `${formatBytes(status.downloadedBytes)} of ${formatBytes(status.totalBytes)}`;
    els.progress.hidden = false;
    els.progressBar.style.width = `${pct}%`;
  } else if (phase === "loading") {
    els.statusPillText.textContent = "Loading model";
    els.modelStatus.textContent = status.message || "Loading…";
    els.progress.hidden = true;
  } else if (phase === "error") {
    els.statusPillText.textContent = "Model error";
    els.modelStatus.textContent = status.error || status.message || "Failed to load.";
    els.progress.hidden = true;
  } else {
    els.statusPillText.textContent = "Not loaded";
    els.modelStatus.textContent = status.message || "Waiting…";
    els.progress.hidden = true;
  }

  if (status.device) els.specDevice.textContent = status.device;

  // The context window is chosen at load time based on available RAM, so show the real
  // value rather than the catalog default.
  if (Number.isFinite(status.contextSize) && status.contextSize > 0)
    els.specContext.textContent = `${status.contextSize} tokens`;

  if (Number.isFinite(status.freeRamBytes) && status.freeRamBytes > 0)
    els.specMemory.textContent = formatBytes(status.freeRamBytes);
  if (!activeConversation()?.messages.length) renderWelcomeNote();
}

/**
 * Render the cached/available model list with per-model actions.
 * Cached models can be switched to instantly; uncached ones are downloaded into the cache.
 */
function renderModels() {
  if (!els.modelList) return;

  els.modelList.replaceChildren();

  for (const model of state.models) {
    const row = document.createElement("div");
    row.className = "model-row";
    if (model.id === state.activeModelId) row.classList.add("is-active");

    const info = document.createElement("div");
    info.className = "model-row-info";

    const title = document.createElement("div");
    title.className = "model-row-title";
    title.textContent = model.name;
    if (model.isDefault) {
      const badge = document.createElement("span");
      badge.className = "model-badge";
      badge.textContent = "DEFAULT";
      title.append(badge);
    }

    const meta = document.createElement("div");
    meta.className = "model-row-meta";
    const parts = [model.quantization, model.approxSize].filter(Boolean);
    parts.push(model.cached ? "cached" : "not cached");
    meta.textContent = parts.join(" · ");

    info.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "model-row-actions";

    const isActive = model.id === state.activeModelId;
    const busy = state.switchingModelId != null;
    const phase = statusOf().phase;
    const working = phase === "downloading" || phase === "loading";

    if (!model.cached) {
      const installBtn = document.createElement("button");
      installBtn.type = "button";
      installBtn.className = "ghost-btn small";
      installBtn.textContent = "Cache it";
      installBtn.disabled = busy || working;
      installBtn.title = "Download into the cache without loading it";
      installBtn.addEventListener("click", () => installModelFile(model));
      actions.append(installBtn);
    } else if (isActive) {
      const unloadBtn = document.createElement("button");
      unloadBtn.type = "button";
      unloadBtn.className = "ghost-btn small";
      unloadBtn.textContent = "In use";
      unloadBtn.disabled = true;
      actions.append(unloadBtn);
    } else {
      const switchBtn = document.createElement("button");
      switchBtn.type = "button";
      switchBtn.className = "primary-btn small";
      switchBtn.textContent = state.switchingModelId === model.id ? "Switching…" : "Switch";
      switchBtn.disabled = busy || working;
      switchBtn.addEventListener("click", () => switchModel(model));
      actions.append(switchBtn);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "danger-btn small";
      removeBtn.textContent = "Remove";
      removeBtn.title = "Delete this file from the cache";
      removeBtn.disabled = busy || working;
      removeBtn.addEventListener("click", () => removeModelFile(model));
      actions.append(removeBtn);
    }

    row.append(info, actions);
    els.modelList.append(row);
  }

  if (els.cacheUsage) {
    const cachedCount = state.models.filter(model => model.cached).length;
    els.cacheUsage.textContent = `${cachedCount} of ${state.models.length} model${state.models.length === 1 ? "" : "s"} cached.`;
  }
}

async function switchModel(model) {
  if (state.streaming) return toast("Stop the current response first.");

  state.switchingModelId = model.id;
  renderModels();
  toast(`Switching to ${model.name}…`);

  try {
    const response = await fetch("/api/models/switch", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id: model.id})
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Could not switch models.");

    state.activeModelId = data.activeModelId ?? model.id;
    toast(`Now using ${model.name}.`);
    await refreshModels();
  } catch (error) {
    // The previous model is still loaded, so this is informational rather than fatal.
    toast(error.message);
  } finally {
    state.switchingModelId = null;
    renderModels();
  }
}

async function installModelFile(model) {
  state.switchingModelId = model.id;
  renderModels();
  toast(`Caching ${model.name}…`);

  try {
    const response = await fetch("/api/models/install", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id: model.id})
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Could not cache that model.");

    toast(`${model.name} is cached.`);
    await refreshModels();
  } catch (error) {
    toast(error.message);
  } finally {
    state.switchingModelId = null;
    renderModels();
  }
}

async function removeModelFile(model) {
  if (!confirm(`Delete ${model.name} from the cache? It will need downloading again.`)) return;

  try {
    const response = await fetch("/api/models/uninstall", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({id: model.id})
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Could not remove that model.");

    toast(`${model.name} removed from the cache.`);
    await refreshModels();
  } catch (error) {
    toast(error.message);
  }
}

async function unloadLoadedModel() {
  if (state.streaming) return toast("Stop the current response first.");

  try {
    const response = await fetch("/api/models/unload", {method: "POST"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not unload the model.");

    toast(data.unloaded ? "Model unloaded. It will reload from the cache on your next message." : "Nothing was loaded.");
    await refreshModels();
  } catch (error) {
    toast(error.message);
  }
}

async function refreshModels() {
  try {
    const response = await fetch("/api/models");
    const data = await response.json();
    state.models = data.models ?? [];
    state.activeModelId = data.activeModelId ?? null;
    renderModels();
  } catch {
    /* Leave the current list in place. */
  }
}

function connectStatusStream() {
  if (!("EventSource" in window)) {
    pollStatus();
    return;
  }

  const source = new EventSource("/api/status/stream");

  source.onmessage = event => {
    try {
      applyStatus(JSON.parse(event.data));
    } catch {
      /* ignore malformed frames */
    }
  };

  source.onerror = () => {
    els.statusPill.dataset.phase = "offline";
    els.statusPillText.textContent = "Server offline";
    els.modelStatus.textContent = "Lost the connection to the VoxelChat server.";
  };
}

async function pollStatus() {
  try {
    const response = await fetch("/api/status");
    applyStatus(await response.json());
  } catch {
    els.statusPillText.textContent = "Server offline";
  }
  setTimeout(pollStatus, 2000);
}

/* -------------------------------- streaming ------------------------------- */

async function sendMessage(text) {
  const conversation = activeConversation() ?? (startNewChat({focus: false}), activeConversation());

  if (!conversation) return;

  conversation.messages.push({role: "user", content: text});
  if (!conversation.title) conversation.title = titleFor(text);

  els.messages.replaceChildren();
  els.welcome.hidden = true;
  els.topbarTitle.textContent = conversation.title;

  for (const message of conversation.messages) {
    els.messages.append(buildMessageElement(message.role, message.content));
  }

  const assistantEl = buildMessageElement("assistant", "", {streaming: true});
  const assistantBody = assistantEl.querySelector(".message-body");
  assistantBody.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  els.messages.append(assistantEl);

  saveState();
  renderSidebar();
  scrollToBottom(true);
  setStreaming(true);

  const controller = new AbortController();
  state.aborter = controller;

  let received = "";
  let started = false;
  let retryStatusAfter = false;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        messages: conversation.messages.map(({role, content}) => ({role, content})),
        systemPrompt: state.systemPrompt
      }),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const {value, done} = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, {stream: true});

      // SSE frames are separated by a blank line.
      let splitIndex;
      while ((splitIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + 2);

        const eventMatch = /^event: (.+)$/m.exec(frame);
        const dataMatch = /^data: (.+)$/m.exec(frame);
        if (!dataMatch) continue;

        let payload;
        try {
          payload = JSON.parse(dataMatch[1]);
        } catch {
          continue;
        }

        const eventName = eventMatch?.[1] ?? "message";

        if (eventName === "chunk") {
          if (!started) {
            started = true;
            assistantBody.textContent = "";
          }
          received += payload.text ?? "";
          assistantBody.textContent = received;
          scrollToBottom();
        } else if (eventName === "error") {
          retryStatusAfter = true;
          throw new Error(payload.error || payload.details || "Generation failed.");
        } else if (eventName === "done") {
          if (payload.stopReason === "aborted") toast("Response stopped.");
        }
      }
    }

    assistantEl.classList.remove("streaming");
    conversation.messages.push({role: "assistant", content: received});

    // Re-render the turn so the copy button appears.
    assistantEl.replaceWith(buildMessageElement("assistant", received));
  } catch (error) {
    assistantEl.classList.remove("streaming");

    if (controller.signal.aborted) {
      if (received) {
        conversation.messages.push({role: "assistant", content: received});
        assistantEl.replaceWith(buildMessageElement("assistant", received));
      } else {
        assistantEl.querySelector(".message-body").textContent = "Stopped before the model responded.";
        assistantEl.classList.add("error");
      }
    } else {
      retryStatusAfter = true;
      assistantBody.textContent = error?.message ?? String(error);
      assistantEl.classList.add("error");
      if (!received) {
        const index = conversation.messages.length - 1;
        if (index >= 0 && conversation.messages[index].role === "user") conversation.messages.pop();
      }
    }
  } finally {
    state.aborter = null;
    setStreaming(false);
    saveState();
    renderSidebar();
    scrollToBottom();
    els.prompt.focus();

    if (retryStatusAfter) pollStatus();
  }
}

/* --------------------------------- events --------------------------------- */

els.composer.addEventListener("submit", event => {
  event.preventDefault();
  if (state.streaming) return;

  const text = els.prompt.value.trim();
  if (!text) return;

  els.prompt.value = "";
  autoGrow();
  sendMessage(text);
});

els.prompt.addEventListener("input", autoGrow);

els.prompt.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    els.composer.requestSubmit();
  }
});

els.stopBtn.addEventListener("click", async () => {
  // Tell the server to stop explicitly. Relying only on aborting the fetch can leave the
  // server generating in the background: the request may already have been fully sent,
  // so the dropped connection is not always noticed.
  els.stopBtn.disabled = true;

  try {
    await fetch("/api/chat/stop", {method: "POST"});
  } catch {
    /* The server may be unreachable; the local abort below still cleans up the UI. */
  }

  state.aborter?.abort();
  els.stopBtn.disabled = false;
});

els.newChat.addEventListener("click", () => {
  startNewChat();
  closeSidebar();
});

for (const button of document.querySelectorAll(".suggestion")) {
  button.addEventListener("click", () => {
    const prompt = button.dataset.prompt;
    if (!prompt || state.streaming) return;
    sendMessage(prompt);
  });
}

function openSidebar() {
  els.sidebar.classList.add("open");
  els.scrim.hidden = false;
}

function closeSidebar() {
  els.sidebar.classList.remove("open");
  els.scrim.hidden = true;
}

els.openSidebar.addEventListener("click", openSidebar);
els.closeSidebar.addEventListener("click", closeSidebar);
els.scrim.addEventListener("click", closeSidebar);

els.openSettings.addEventListener("click", () => {
  els.systemPrompt.value = state.systemPrompt;
  updateSystemPromptCount();
  els.settingsDialog.showModal();
  closeSidebar();
});

function updateSystemPromptCount() {
  els.systemPromptCount.textContent = `${els.systemPrompt.value.length} / 4000`;
}

els.systemPrompt.addEventListener("input", updateSystemPromptCount);

els.resetSystemPrompt.addEventListener("click", () => {
  els.systemPrompt.value = state.defaultSystemPrompt;
  updateSystemPromptCount();
});

function saveSettings() {
  const value = els.systemPrompt.value.trim();
  state.systemPrompt = value.length > 0 ? value.slice(0, 4000) : state.defaultSystemPrompt;
  saveState();
  els.settingsDialog.close();
  toast("Settings saved.");
}

document.getElementById("saveSettings").addEventListener("click", saveSettings);
document.getElementById("closeSettings").addEventListener("click", () => els.settingsDialog.close());
els.unloadModel.addEventListener("click", unloadLoadedModel);

els.clearAll.addEventListener("click", () => {
  if (!confirm("Delete every conversation? This cannot be undone.")) return;
  state.conversations = [];
  state.activeId = null;
  saveState();
  startNewChat({focus: false});
  renderSidebar();
  els.settingsDialog.close();
  toast("All conversations deleted.");
});

document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    startNewChat();
  }
  if (event.key === "Escape" && els.sidebar.classList.contains("open")) closeSidebar();
});

/* ---------------------------------- boot ---------------------------------- */

async function boot() {
  loadState();

  try {
    const response = await fetch("/api/system-prompt");
    const data = await response.json();
    state.defaultSystemPrompt = data.systemPrompt ?? "";
  } catch {
    state.defaultSystemPrompt = "You are a helpful assistant.";
  }

  if (!state.systemPrompt) state.systemPrompt = state.defaultSystemPrompt;

  if (state.conversations.length === 0) {
    startNewChat({focus: false});
  } else {
    if (!state.conversations.some(conversation => conversation.id === state.activeId))
      state.activeId = state.conversations[0].id;
    renderConversation();
  }

  renderSidebar();
  applyStatus({status: statusOf()});
  connectStatusStream();
  autoGrow();
  els.prompt.focus();
}

boot();
