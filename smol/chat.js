import { SmolEngine, defaultDevice } from "./engine.js";
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
  modelId: "onnx-community/SmolLM2-1.7B-Instruct",
  device: "auto",
  temperature: 0.7,
  top_p: 0.95,
  max_new_tokens: 256,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch {}
  if (!settings.device) settings.device = "auto";
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

function showProgress(info) {
  if (info.status === "fallback") {
    progressEl.hidden = false;
    progressFill.style.width = "100%";
    progressText.textContent = info.message;
    return;
  }
  if (info.status === "done" || info.status === "ready") {
    progressEl.hidden = true;
    return;
  }
  if (info.status === "progress" && info.total) {
    progressEl.hidden = false;
    const pct = Math.round((info.loaded / info.total) * 100);
    progressFill.style.width = `${pct}%`;
    const file = (info.file || "").split("/").pop();
    progressText.textContent = `downloading ${file} — ${pct}%`;
  } else if (info.status) {
    progressEl.hidden = false;
    progressText.textContent = String(info.status);
  }
}

/* ------------------------------ the engine ------------------------------ */

let engine = null;

function ensureEngine() {
  if (engine) return engine;
  engine = new SmolEngine({
    modelId: settings.modelId,
    device: settings.device,
    onProgress: showProgress,
  });
  return engine;
}

async function warmUp() {
  setStatus("loading", "loading weights");
  try {
    await ensureEngine().load();
    setStatus("ready", `${engine.device} · ready`);
    progressEl.hidden = true;
  } catch (err) {
    console.error(err);
    setStatus("error", "load failed");
    progressText.textContent = String(err?.message || err);
    progressEl.hidden = false;
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
    const messages = [
      ...(settings.systemPrompt.trim()
        ? [{ role: "system", content: settings.systemPrompt.trim() }]
        : []),
      ...history,
    ].filter((m) => m.content);

    const { text: reply, interrupted } = await ensureEngine().chat(messages, {
      temperature: settings.temperature,
      top_p: settings.top_p,
      max_new_tokens: settings.max_new_tokens,
      onToken: (chunk) => {
        acc += chunk;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(paint);
        }
      },
      onStats: (s) => {
        const tps = s.tokensPerSecond.toFixed(1);
        setStatus("ready", `${s.device} · ${tps} tok/s`);
      },
    });

    acc = reply || acc;
    bubble.innerHTML = renderMarkdown(acc || "_(no reply — try a longer max tokens setting)_");
    if (reply) history.push({ role: "assistant", content: reply });
    if (interrupted) setStatus("ready", `${engine.device} · stopped`);
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
  engine?.stop?.();
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
const deviceEl = $("device");
const tempEl = $("temperature");
const topPEl = $("topP");
const maxTokEl = $("maxTokens");

function syncSettingsUI() {
  sysEl.value = settings.systemPrompt;
  modelEl.value = settings.modelId;
  deviceEl.value = settings.device;
  tempEl.value = settings.temperature;
  topPEl.value = settings.top_p;
  maxTokEl.value = settings.max_new_tokens;
  $("tempOut").textContent = Number(settings.temperature).toFixed(2);
  $("topPOut").textContent = Number(settings.top_p).toFixed(2);
  $("maxTokOut").textContent = settings.max_new_tokens;
}

$("settingsBtn").addEventListener("click", () => {
  syncSettingsUI();
  settingsEl.showModal();
});

tempEl.addEventListener("input", () => ($("tempOut").textContent = Number(tempEl.value).toFixed(2)));
topPEl.addEventListener("input", () => ($("topPOut").textContent = Number(topPEl.value).toFixed(2)));
maxTokEl.addEventListener("input", () => ($("maxTokOut").textContent = maxTokEl.value));

settingsEl.addEventListener("close", async () => {
  const prev = { ...settings };
  settings.systemPrompt = sysEl.value;
  settings.modelId = modelEl.value.trim() || prev.modelId;
  settings.device = deviceEl.value;
  settings.temperature = Number(tempEl.value);
  settings.top_p = Number(topPEl.value);
  settings.max_new_tokens = Number(maxTokEl.value);
  saveSettings();

  const needsReload =
    settingsEl.returnValue === "reload" ||
    settings.modelId !== prev.modelId ||
    settings.device !== prev.device;

  if (needsReload) {
    engine = null;
    progressEl.hidden = false;
    progressFill.style.width = "0%";
    progressText.textContent = "loading weights…";
    await warmUp();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsEl.open) settingsEl.close("cancel");
});

/* --------------------------------- boot -------------------------------- */

loadSettings();
syncSettingsUI();
restoreHistory();
setStatus("idle", `idle · ${defaultDevice()} available`);
// Kick off the load lazily on first interaction, but start warming after a beat
// so the user sees progress while they read the intro.
setTimeout(() => {
  progressEl.hidden = false;
  progressText.textContent = "waking up…";
  warmUp();
}, 600);
