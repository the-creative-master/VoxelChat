// VoxelChat frontend — talks only to the local VoxelChat server on this machine.
const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages"), welcomeEl = $("#welcome"), inputEl = $("#input");
const sendBtn = $("#sendBtn"), stopBtn = $("#stopBtn"), statusText = $("#statusText");
const dot = document.querySelector("#status .dot");

let messages = JSON.parse(localStorage.getItem("voxelchat.messages") || "[]");
let ready = false, generating = false, controller = null;

// ---------- tiny safe markdown (escape first, then format) ----------
function render(text) {
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  return html.split(/\n{2,}/).map((p) => (p.startsWith("<pre>") ? p : `<p>${p.replace(/\n/g, "<br>")}</p>`)).join("");
}

function addBubble(role, text) {
  welcomeEl.classList.add("hidden");
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "user" : "ai"}`;
  wrap.innerHTML = `<span class="avatar">${role === "user" ? "🧑" : "V"}</span><div class="bubble"></div>`;
  wrap.querySelector(".bubble").innerHTML = text ? render(text) : `<span class="typing"><i></i><i></i><i></i></span>`;
  messagesEl.appendChild(wrap);
  scrollDown();
  return wrap.querySelector(".bubble");
}
function scrollDown() { $("#chat").scrollTo({ top: $("#chat").scrollHeight, behavior: "smooth" }); }

function renderHistory() {
  messagesEl.innerHTML = "";
  if (!messages.length) { welcomeEl.classList.remove("hidden"); return; }
  for (const m of messages) addBubble(m.role, m.content);
}
function save() { localStorage.setItem("voxelchat.messages", JSON.stringify(messages.slice(-60))); }

// ---------- model status ----------
async function pollStatus() {
  try {
    const s = await (await fetch("/api/status")).json();
    ready = s.phase === "ready";
    if (s.phase === "loading") statusText.textContent = `Loading ${s.modelName}…`;
    else if (s.phase === "ready") {
      statusText.textContent = "Ready · offline"; dot.className = "dot";
      $("#modelHint").textContent = `${s.modelName} · cached on this machine, no download · Enter to send`;
    } else if (s.phase === "error" || s.phase === "missing") {
      statusText.textContent = s.phase === "missing" ? "Model not cached" : "Model failed to start"; dot.className = "dot off";
      $("#errorText").textContent = "⚠️ " + (s.error || "The cached local model couldn't start.");
      $("#errorBanner").classList.remove("hidden");
    } else statusText.textContent = "Starting…";
    dot.classList.toggle("busy", !ready && s.phase !== "error");
    sendBtn.disabled = !ready || !inputEl.value.trim() || generating;
  } catch { statusText.textContent = "Connecting…"; }
  setTimeout(pollStatus, 1200);
}

// ---------- chat ----------
async function send(text) {
  text = (text ?? inputEl.value).trim();
  if (!text || !ready || generating) return;
  messages.push({ role: "user", content: text }); save();
  addBubble("user", text);
  inputEl.value = ""; autoGrow();
  generating = true; stopBtn.classList.remove("hidden"); sendBtn.classList.add("hidden");
  const bubble = addBubble("assistant", "");
  let reply = "";
  controller = new AbortController();
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }), signal: controller.signal,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
    const reader = res.body.getReader(), decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n"); buf = events.pop();
      for (const ev of events) {
        const data = JSON.parse(ev.split("\ndata: ")[1] || "{}");
        if (ev.startsWith("event: token")) { reply += data.text; bubble.innerHTML = render(reply); scrollDown(); }
        if (ev.startsWith("event: error")) throw new Error(data.error);
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") reply = reply || "⚠️ " + err.message;
  }
  bubble.innerHTML = render(reply || "…");
  if (reply && !reply.startsWith("⚠️")) { messages.push({ role: "assistant", content: reply }); save(); }
  generating = false; stopBtn.classList.add("hidden"); sendBtn.classList.remove("hidden");
  pollStatus(); inputEl.focus();
}

function autoGrow() { inputEl.style.height = "auto"; inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px"; sendBtn.disabled = !ready || !inputEl.value.trim() || generating; }

$("#form").addEventListener("submit", (e) => { e.preventDefault(); send(); });
inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
stopBtn.addEventListener("click", () => controller?.abort());
$("#newChat").addEventListener("click", () => { messages = []; save(); renderHistory(); inputEl.focus(); });
$("#retryBtn").addEventListener("click", async () => { $("#errorBanner").classList.add("hidden"); await fetch("/api/retry", { method: "POST" }); });
document.querySelectorAll(".suggestions button").forEach((b) => b.addEventListener("click", () => { if (ready) send(b.dataset.prompt); else { inputEl.value = b.dataset.prompt; autoGrow(); } }));

renderHistory();
pollStatus();
inputEl.focus();
