// VoxelChat for GitHub Pages — a real AI running 100% in this browser tab.
//
// No server, no install, no API key, nothing for the visitor to do:
// llama.cpp (via @wllama/wllama WebAssembly) loads SmolLM2 1.7B once,
// the browser caches it, and every later visit opens instantly — offline.
import { Wllama } from "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/index.js";
import WasmFromCDN from "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/wasm-from-cdn.js";

const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages"), welcomeEl = $("#welcome"), inputEl = $("#input");
const sendBtn = $("#sendBtn"), statusText = $("#statusText"), dot = $("#dot");

const MODEL = { repo: "HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF", file: "smollm2-1.7b-instruct-q4_k_m.gguf" };
const SYSTEM = "You are VoxelChat, a friendly and helpful AI assistant. Answer clearly and concisely. Use Markdown when it helps. If you don't know something, say so.";

let messages = JSON.parse(localStorage.getItem("voxelchat.pages.messages") || "[]");
let wllama = null, ready = false, generating = false;

// ---------- tiny safe markdown ----------
function render(text) {
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  return html.split(/\n{2,}/).map((p) => (p.startsWith("<pre>") ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`)).join("");
}
function addBubble(role, text) {
  welcomeEl.classList.add("hidden");
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "user" : "ai"}`;
  wrap.innerHTML = `<span class="avatar">${role === "user" ? "🧑" : "V"}</span><div class="bubble"></div>`;
  wrap.querySelector(".bubble").innerHTML = text ? render(text) : `<span class="typing"><i></i><i></i><i></i></span>`;
  messagesEl.appendChild(wrap); scrollDown();
  return wrap.querySelector(".bubble");
}
function scrollDown() { $("#chat").scrollTo({ top: $("#chat").scrollHeight, behavior: "smooth" }); }
function save() { localStorage.setItem("voxelchat.pages.messages", JSON.stringify(messages.slice(-60))); }
function renderHistory() { messagesEl.innerHTML = ""; if (!messages.length) welcomeEl.classList.remove("hidden"); else for (const m of messages) addBubble(m.role, m.content); }

// ---------- load the AI (automatic, cached by the browser) ----------
async function initAI() {
  try {
    statusText.textContent = "Preparing AI…";
    wllama = new Wllama(WasmFromCDN, { allowOffline: true, suppressNativeLog: true });
    $("#progressWrap").classList.remove("hidden");
    await wllama.loadModelFromHF(MODEL, {
      n_ctx: 2048,
      useCache: true,
      allowOffline: true,
      progressCallback: ({ loaded, total }) => {
        if (!total) return;
        const pct = Math.round((loaded / total) * 100);
        $("#progressBar").style.width = pct + "%";
        $("#progressLabel").textContent = pct >= 100
          ? "Loading the AI into this tab…"
          : `Bringing your AI to this tab — ${pct}% (${(loaded / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB, first visit only)`;
        statusText.textContent = pct >= 100 ? "Loading model…" : `Loading AI… ${pct}%`;
      },
    });
    $("#progressWrap").classList.add("hidden");
    ready = true; dot.className = "dot";
    statusText.textContent = "Ready · in your browser";
    $("#modelHint").textContent = "SmolLM2 1.7B · running in this tab, cached & private · Enter to send";
    inputEl.disabled = false; autoGrow(); inputEl.focus();
  } catch (err) {
    console.error(err);
    dot.className = "dot off"; statusText.textContent = "Couldn't load the AI";
    $("#progressWrap").classList.add("hidden");
    $("#errorText").textContent = "⚠️ The AI couldn't load in this browser. Check your connection (needed once), then Retry. " + (err?.message || err);
    $("#errorBanner").classList.remove("hidden");
  }
}

// ---------- chat ----------
async function send(text) {
  text = (text ?? inputEl.value).trim();
  if (!text || !ready || generating) return;
  messages.push({ role: "user", content: text }); save();
  addBubble("user", text);
  inputEl.value = ""; autoGrow();
  generating = true; sendBtn.disabled = true;
  const bubble = addBubble("assistant", "");
  let reply = "";
  try {
    const stream = await wllama.createChatCompletion({
      messages: [{ role: "system", content: SYSTEM }, ...messages.slice(-20)],
      max_tokens: 512, temperature: 0.7, top_k: 40, top_p: 0.9, stream: true,
    });
    for await (const chunk of stream) {
      const piece = chunk?.choices?.[0]?.delta?.content || "";
      if (piece) { reply += piece; bubble.innerHTML = render(reply); scrollDown(); }
    }
  } catch (err) { if (!reply) reply = "⚠️ " + (err?.message || err); }
  bubble.innerHTML = render(reply || "…");
  if (reply && !reply.startsWith("⚠️")) { messages.push({ role: "assistant", content: reply }); save(); }
  generating = false; autoGrow(); inputEl.focus();
}
function autoGrow() { inputEl.style.height = "auto"; inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px"; sendBtn.disabled = !ready || generating || !inputEl.value.trim(); }

$("#form").addEventListener("submit", (e) => { e.preventDefault(); send(); });
inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
$("#newChat").addEventListener("click", async () => { messages = []; save(); renderHistory(); try { await wllama?.kvClear(); } catch {} inputEl.focus(); });
$("#retryBtn").addEventListener("click", () => { $("#errorBanner").classList.add("hidden"); initAI(); });
document.querySelectorAll(".suggestions button").forEach((b) => b.addEventListener("click", () => (ready ? send(b.dataset.prompt) : (inputEl.value = b.dataset.prompt))));

renderHistory();
initAI();
