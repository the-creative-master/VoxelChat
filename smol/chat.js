import { SmolEngine } from "./engine.js";
import { escapeHtml, renderMarkdown } from "./markdown.js";

/* ------------------------------------------------------------------ *
 * Smol — a character that lives in the tab. UI glue + tiny renderer.
 * ------------------------------------------------------------------ */

const DEFAULT_SYSTEM = [
  "You are Smol, a small-but-plucky 1.7 billion parameter language model running",
  "entirely inside the user's web browser. You're cheerful, curious, a little",
  "self-aware about being tiny, and genuinely helpful.",
  "",
  "Style:",
  "- Warm and conversational. Short paragraphs. No corporate filler.",
  "- Occasionally (not every message) make a light joke about your size, your",
  "  token budget, or the fact that you live in a browser tab.",
  "- You can use markdown: **bold**, `code`, lists, fenced code blocks.",
  "- If you don't know something or can't do it, say so plainly instead of inventing facts.",
].join("\n");

const STORE_KEY = "smol-settings-v1";
const HISTORY_KEY = "smol-history-v1";

const settings = {
  systemPrompt: DEFAULT_SYSTEM,
  modelId: "", // empty = use the server's default GGUF
  temperature: 0.7,
  top_p: 0.95,
  min_p: 0.05,
  max_tokens: 256,
};

// Old keys from the browser-inference version; ignore them when restoring.
const LEGACY_KEYS = ["device", "max_new_tokens"];

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch {}
  for (const key of LEGACY_KEYS) delete settings[key];
}
function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {}
}

/** @type {Array<{role:'user'|'assistant', content:string}>} */
let history = [];

const $ = (id) => document.getElementById(id);
const chatEl = $("chat");
const emptyEl = $("empty");
const inputEl = $("input");
const sendBtn = $("sendBtn");
const stopBtn = $("stopBtn");
const statusEl = $("status");
const statusText = $("statusText");
const avatarEl = $("avatar");
const progressEl = $("progress");
const progressFill = $("progressFill");
const progressText = $("progressText");
const settingsEl = $("settings");

/* ------------------------------ rendering ------------------------------ */

function scrollToBottom(force = false) {
  const nearBottom =
    chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 140;
  if (force || nearBottom) chatEl.scrollTop = chatEl.scrollHeight;
}

function addMessage(role, content = "") {
  // The intro panel lives in the DOM; hide it once a conversation starts and
  // bring it back when the chat is cleared.
  if (emptyEl) emptyEl.hidden = true;
  const row = document.createElement("div");
  row.className = `msg ${role === "user" ? "user" : "bot"}`;
  if (role === "system") row.hidden = true;

  const who = document.createElement("div");
  who.className = "who";
  who.textContent = role === "user" ? "Y" : "S";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (content) bubble.innerHTML = role === "user" ? `<p>${escapeHtml(content)}</p>` : renderMarkdown(content);

  row.append(who, bubble);
  chatEl.append(row);
  scrollToBottom(true);
  return bubble;
}

/* ------------------------------ status UI ------------------------------ */

function setStatus(state, label) {
  statusEl.dataset.state = state;
  statusText.textContent = label;
  avatarEl.classList.toggle("generating", state === "thinking");
}

function setBusy(busy) {
  sendBtn.hidden = busy;
  stopBtn.hidden = !busy;
  sendBtn.disabled = busy;
  inputEl.disabled = busy;
}

function showProgress(status) {
  const { phase, progress, error } = status || {};
  if (phase === "error") {
    progressEl.hidden = false;
    progressFill.style.width = "0%";
    progressText.textContent = `model failed: ${error || "unknown error"}`;
    return;
  }
  if (phase === "downloading" && progress) {
    progressEl.hidden = false;
    const pct = Math.round((progress.downloadProgress || 0) * 100);
    progressFill.style.width = `${pct}%`;
    const mb = progress.sizeMb ? `${progress.sizeMb.toFixed(0)} MiB` : "";
    const total = progress.totalMb ? ` / ${progress.totalMb.toFixed(0)} MiB` : "";
    progressText.textContent = `downloading ${progress.file || "GGUF"} — ${pct}%${mb ? ` (${mb}${total})` : ""}`;
    return;
  }
  if (phase === "loading") {
    progressEl.hidden = false;
    progressFill.style.width = "100%";
    progressText.textContent = "loading weights into llama.cpp…";
    return;
  }
  progressEl.hidden = true;
}

/* ------------------------------ the engine ------------------------------ */

let engine = null;

function ensureEngine() {
  if (engine) return engine;
  engine = new SmolEngine({
    modelId: settings.modelId,
    systemPrompt: settings.systemPrompt.trim(),
  });
  engine.onStatus(showProgress);
  return engine;
}

async function warmUp({ modelId, force = false } = {}) {
  setStatus("loading", "connecting");
  progressEl.hidden = false;
  progressFill.style.width = "0%";
  progressText.textContent = "contacting llama.cpp backend…";

  // load() fails fast (with a clear message) if `npm start` isn't running.
  const e = ensureEngine();
  try {
    const status = await e.load({
      modelId: modelId || settings.modelId || undefined,
      systemPrompt: settings.systemPrompt.trim(),
      force,
    });
    setStatus("ready", `${status.backend || "cpu"} · ready`);
    progressEl.hidden = true;
  } catch (err) {
    console.error(err);
    setStatus("error", "backend unavailable");
    progressEl.hidden = false;
    progressFill.style.width = "0%";
    progressText.textContent = `Could not start the model: ${err?.message || err}`;
  }
}

/* ------------------------------- chatting ------------------------------- */

async function send(text) {
  text = (text ?? inputEl.value).trim();
  if (!text) return;

  inputEl.value = "";
  autosize();
  addMessage("user", text);
  history.push({ role: "user", content: text });

  const bubble = addMessage("assistant", "");
  bubble.innerHTML = '<span class="cursor"></span>';

  let acc = "";
  let rafPending = false;

  const paint = () => {
    rafPending = false;
    bubble.innerHTML = renderMarkdown(acc) + '<span class="cursor"></span>';
    scrollToBottom();
  };

  setBusy(true);
  setStatus("thinking", "thinking");

  try {
    const messages = history.filter((m) => m.content);

    const reply = await ensureEngine().chat(messages, {
      temperature: settings.temperature,
      top_p: settings.top_p,
      min_p: settings.min_p,
      max_tokens: settings.max_tokens,
      onToken: (chunk) => {
        acc += chunk;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(paint);
        }
      },
      onStats: (s) => {
        const tps = Number(s.tokensPerSecond || 0).toFixed(1);
        const where = s.backend ? ` · ${s.backend}` : "";
        setStatus("ready", `${tps} tok/s${where}`);
        if (s.contextUsed && s.contextSize) {
          console.info(`context: ${s.contextUsed}/${s.contextSize} tokens`);
        }
      },
    });

    acc = reply || acc;
    bubble.innerHTML = renderMarkdown(acc || "_(no reply — try a different prompt)_");
    if (reply) history.push({ role: "assistant", content: reply });
    persistHistory();
  } catch (err) {
    console.error(err);
    bubble.classList.add("error");
    bubble.textContent = `Something broke: ${err?.message || err}`;
    setStatus("error", "generation failed");
  } finally {
    setBusy(false);
    scrollToBottom();
  }
}

/* ------------------------------ persistence ----------------------------- */

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40)));
  } catch {}
}

function restoreHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return;
    history = JSON.parse(raw);
    for (const m of history) addMessage(m.role === "user" ? "user" : "assistant", m.content);
    scrollToBottom(true);
  } catch {}
}

/* -------------------------------- wiring -------------------------------- */

function autosize() {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
}

inputEl.addEventListener("input", autosize);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  send();
});

stopBtn.addEventListener("click", () => {
  engine?.stop();
  setStatus("ready", "stopping…");
});

document.querySelectorAll(".suggestions button").forEach((b) =>
  b.addEventListener("click", () => send(b.dataset.say))
);

$("resetBtn").addEventListener("click", () => {
  ensureEngine().reset();
  history = [];
  persistHistory();
  chatEl.querySelectorAll(".msg").forEach((n) => n.remove());
  if (emptyEl) {
    emptyEl.hidden = false;
    chatEl.append(emptyEl);
  }
});

// --------- settings dialog ---------
const sysEl = $("systemPrompt");
const modelEl = $("modelId");
const minPEl = $("minP");
const tempEl = $("temperature");
const topPEl = $("topP");
const maxTokEl = $("maxTokens");

function syncSettingsUI() {
  sysEl.value = settings.systemPrompt;
  modelEl.value = settings.modelId;
  minPEl.value = settings.min_p;
  tempEl.value = settings.temperature;
  topPEl.value = settings.top_p;
  maxTokEl.value = settings.max_tokens;
  $("tempOut").textContent = Number(settings.temperature).toFixed(2);
  $("topPOut").textContent = Number(settings.top_p).toFixed(2);
  $("maxTokOut").textContent = settings.max_tokens;
  $("minPOut").textContent = Number(settings.min_p).toFixed(2);
}

$("settingsBtn").addEventListener("click", () => {
  syncSettingsUI();
  settingsEl.showModal();
});

tempEl.addEventListener("input", () => ($("tempOut").textContent = Number(tempEl.value).toFixed(2)));
topPEl.addEventListener("input", () => ($("topPOut").textContent = Number(topPEl.value).toFixed(2)));
maxTokEl.addEventListener("input", () => ($("maxTokOut").textContent = maxTokEl.value));
minPEl.addEventListener("input", () => ($("minPOut").textContent = Number(minPEl.value).toFixed(2)));

settingsEl.addEventListener("close", async () => {
  const prev = { ...settings };
  settings.systemPrompt = sysEl.value;
  settings.modelId = modelEl.value.trim();
  settings.min_p = Number(minPEl.value);
  settings.temperature = Number(tempEl.value);
  settings.top_p = Number(topPEl.value);
  settings.max_tokens = Number(maxTokEl.value);
  saveSettings();

  // Temperature/top-p apply per request; the system prompt resets the model's memory.
  if (settings.systemPrompt !== prev.systemPrompt) {
    ensureEngine().applySystemPrompt(settings.systemPrompt.trim());
  }
  const needsReload = settingsEl.returnValue === "reload" || settings.modelId !== prev.modelId;

  if (needsReload) {
    engine = null;
    await warmUp({ modelId: settings.modelId || undefined });
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsEl.open) settingsEl.close("cancel");
});

/* --------------------------------- boot -------------------------------- */

loadSettings();
syncSettingsUI();
restoreHistory();
setStatus("idle", "idle");
// The server may already have the model resident (or be mid-download): ask for
// status right away and warm up if needed.
(async () => {
  const status = await ensureEngine().refreshStatus();
  if (!status) {
    setStatus("error", "backend offline");
    progressEl.hidden = false;
    progressFill.style.width = "0%";
    progressText.textContent = "No llama.cpp backend found — run `npm start` and open the URL it prints.";
    return;
  }
  if (status.phase === "ready") {
    setStatus("ready", `${status.backend || "cpu"} · ready`);
    return;
  }
  if (status.phase === "error") return showProgress(status);
  setTimeout(() => warmUp(), 400);
})();
