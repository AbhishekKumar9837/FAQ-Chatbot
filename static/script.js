/**
 * FAQ Chatbot — script.js
 * ========================
 * Handles:
 *  - Chat message sending & rendering
 *  - Typing indicator
 *  - Confidence badge display
 *  - Dark / Light mode toggle (persisted in localStorage)
 *  - Speech-to-Text input (Web Speech API)
 *  - Text-to-Speech output (Web Speech API)
 *  - FAQ sidebar: load, filter, search, add, delete
 *  - Suggestion chips
 *  - Conversation history in sessionStorage
 *  - Conversation export as .txt
 */

"use strict";

/* ============================================================
   DOM References
   ============================================================ */
const chatWindow     = document.getElementById("chatWindow");
const userInput      = document.getElementById("userInput");
const sendBtn        = document.getElementById("sendBtn");
const voiceBtn       = document.getElementById("voiceBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const ttsToggleBtn   = document.getElementById("ttsToggleBtn");
const exportBtn      = document.getElementById("exportBtn");
const clearChatBtn   = document.getElementById("clearChatBtn");
const sidebarToggle  = document.getElementById("sidebarToggleBtn");
const sidebarCloseBtn= document.getElementById("sidebarCloseBtn");
const sidebar        = document.getElementById("sidebar");
const welcomeBanner  = document.getElementById("welcomeBanner");
const faqList        = document.getElementById("faqList");
const faqSearchInput = document.getElementById("faqSearchInput");
const categoryFilter = document.getElementById("categoryFilter");
const addFaqToggle   = document.getElementById("addFaqToggle");
const addFaqForm     = document.getElementById("addFaqForm");
const submitFaqBtn   = document.getElementById("submitFaqBtn");
const faqFormMsg     = document.getElementById("faqFormMsg");
const toast          = document.getElementById("toast");
const charCount      = document.getElementById("charCount");
const suggestionChips= document.querySelectorAll(".chip");

/* ============================================================
   State
   ============================================================ */
let ttsEnabled      = false;   // Text-to-Speech toggle
let isRecording     = false;   // Voice input active
let allFaqs         = [];      // Full FAQ list from server
let activeCategory  = "all";   // Sidebar category filter
let conversationLog = [];      // { role, text, time } for export

/* ============================================================
   THEME (Dark / Light)
   ============================================================ */
function initTheme() {
  const saved = localStorage.getItem("faq-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next    = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("faq-theme", next);
  updateThemeIcon(next);
  showToast(next === "dark" ? "🌙 Dark mode" : "☀️ Light mode");
}

function updateThemeIcon(theme) {
  themeToggleBtn.textContent = theme === "dark" ? "🌙" : "☀️";
  themeToggleBtn.setAttribute("aria-pressed", theme === "dark");
}

/* ============================================================
   SIDEBAR
   ============================================================ */
function toggleSidebar() {
  sidebar.classList.toggle("hidden");
}

sidebarToggle.addEventListener("click", toggleSidebar);
sidebarCloseBtn.addEventListener("click", () => sidebar.classList.add("hidden"));

// Start sidebar hidden on mobile
if (window.innerWidth < 768) {
  sidebar.classList.add("hidden");
}

/* ============================================================
   FAQ MANAGER — Load & Render
   ============================================================ */
async function loadFaqs() {
  try {
    const res  = await fetch("/faqs");
    allFaqs    = await res.json();
    buildCategoryChips();
    renderFaqList(allFaqs);
  } catch (err) {
    faqList.innerHTML = '<p class="faq-loading" style="color:#ef4444">Failed to load FAQs.</p>';
  }
}

function buildCategoryChips() {
  // Collect unique categories
  const cats = ["all", ...new Set(allFaqs.map(f => f.category || "General"))];
  categoryFilter.innerHTML = "";
  cats.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "cat-chip" + (cat === activeCategory ? " active" : "");
    btn.dataset.cat = cat;
    btn.textContent = cat === "all" ? "All" : cat;
    btn.addEventListener("click", () => {
      activeCategory = cat;
      document.querySelectorAll(".cat-chip").forEach(b => b.classList.toggle("active", b.dataset.cat === cat));
      filterAndRender();
    });
    categoryFilter.appendChild(btn);
  });
}

function filterAndRender() {
  const search = faqSearchInput.value.trim().toLowerCase();
  let filtered = allFaqs;
  if (activeCategory !== "all") {
    filtered = filtered.filter(f => (f.category || "General") === activeCategory);
  }
  if (search) {
    filtered = filtered.filter(f =>
      f.question.toLowerCase().includes(search) || f.answer.toLowerCase().includes(search)
    );
  }
  renderFaqList(filtered);
}

function renderFaqList(faqs) {
  if (faqs.length === 0) {
    faqList.innerHTML = '<p class="faq-loading">No FAQs found.</p>';
    return;
  }
  faqList.innerHTML = "";
  faqs.forEach(faq => {
    const item = document.createElement("div");
    item.className = "faq-item";
    item.setAttribute("role", "listitem");

    const content = document.createElement("div");
    content.className = "faq-item-content";
    content.innerHTML = `
      <div class="faq-item-question" title="${escapeHtml(faq.question)}">${escapeHtml(faq.question)}</div>
      <div class="faq-item-cat">${escapeHtml(faq.category || "General")}</div>
    `;

    // Click to send the FAQ question into the chat
    content.addEventListener("click", () => {
      userInput.value = faq.question;
      autoResizeTextarea();
      if (window.innerWidth < 768) sidebar.classList.add("hidden");
      sendMessage();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "faq-delete-btn";
    delBtn.title = "Delete FAQ";
    delBtn.innerHTML = "🗑️";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteFaq(faq.id);
    });

    item.appendChild(content);
    item.appendChild(delBtn);
    faqList.appendChild(item);
  });
}

faqSearchInput.addEventListener("input", filterAndRender);

/* ============================================================
   FAQ MANAGER — Add
   ============================================================ */
addFaqToggle.addEventListener("click", () => {
  const isVisible = addFaqForm.classList.toggle("visible");
  addFaqToggle.setAttribute("aria-expanded", isVisible);
  addFaqForm.setAttribute("aria-hidden", !isVisible);
});

submitFaqBtn.addEventListener("click", async () => {
  const question = document.getElementById("newQuestion").value.trim();
  const answer   = document.getElementById("newAnswer").value.trim();
  const category = document.getElementById("newCategory").value.trim() || "General";

  if (!question || !answer) {
    faqFormMsg.style.color = "#ef4444";
    faqFormMsg.textContent = "Question and answer are required.";
    return;
  }

  submitFaqBtn.disabled = true;
  try {
    const res  = await fetch("/faqs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, category })
    });
    const data = await res.json();
    if (res.ok) {
      faqFormMsg.style.color = "#10b981";
      faqFormMsg.textContent = "✅ FAQ added!";
      document.getElementById("newQuestion").value = "";
      document.getElementById("newAnswer").value   = "";
      document.getElementById("newCategory").value = "";
      await loadFaqs();
      showToast("FAQ added successfully!");
      setTimeout(() => { faqFormMsg.textContent = ""; }, 3000);
    } else {
      faqFormMsg.style.color = "#ef4444";
      faqFormMsg.textContent = data.error || "Failed to add.";
    }
  } catch {
    faqFormMsg.style.color = "#ef4444";
    faqFormMsg.textContent = "Network error.";
  } finally {
    submitFaqBtn.disabled = false;
  }
});

/* ============================================================
   FAQ MANAGER — Delete
   ============================================================ */
async function deleteFaq(id) {
  if (!confirm("Delete this FAQ?")) return;
  try {
    const res = await fetch(`/faqs/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadFaqs();
      showToast("FAQ deleted.");
    }
  } catch {
    showToast("Failed to delete FAQ.", "error");
  }
}

/* ============================================================
   CHAT — Core
   ============================================================ */
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Hide welcome banner on first message
  if (!welcomeBanner.classList.contains("hidden")) {
    welcomeBanner.classList.add("hidden");
  }

  appendMessage("user", text);
  conversationLog.push({ role: "You", text, time: nowTime() });

  userInput.value = "";
  charCount.textContent = "0";
  autoResizeTextarea();
  sendBtn.disabled = true;

  // Show typing indicator
  const typingEl = showTypingIndicator();

  try {
    const res  = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text })
    });
    const data = await res.json();

    removeTypingIndicator(typingEl);

    if (data.error) {
      appendBotMessage("⚠️ " + data.error, null, null, false);
    } else {
      appendBotMessage(data.answer, data.score, data.matched_question, data.matched);
      conversationLog.push({ role: "TechBot", text: data.answer, time: nowTime() });

      // Text-to-Speech
      if (ttsEnabled) {
        speak(data.answer);
      }
    }
  } catch (err) {
    removeTypingIndicator(typingEl);
    appendBotMessage("⚠️ Sorry, I couldn't connect to the server. Please try again.", null, null, false);
  } finally {
    sendBtn.disabled = false;
    userInput.focus();
  }
}

/* ============================================================
   CHAT — Render Helpers
   ============================================================ */
function appendMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "bot" ? "🤖" : "🧑";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = nowTime();

  bubble.appendChild(time);
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatWindow.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function appendBotMessage(answer, score, matchedQ, matched) {
  const wrap = document.createElement("div");
  wrap.className = "message bot";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "🤖";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = answer;

  // Confidence badge
  if (score !== null && score !== undefined) {
    const badge = document.createElement("div");
    const pct   = Math.round(score * 100);
    let tier    = score >= 0.6 ? "high" : score >= 0.35 ? "medium" : "low";
    if (!matched) tier = "low";
    badge.className = `confidence-badge ${tier}`;
    badge.innerHTML = `📊 Confidence: ${pct}%`;
    bubble.appendChild(badge);
  }

  // Matched question
  if (matchedQ) {
    const mq = document.createElement("div");
    mq.className = "matched-q";
    mq.textContent = `Matched: "${matchedQ}"`;
    bubble.appendChild(mq);
  }

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = nowTime();
  bubble.appendChild(time);

  // Copy button
  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.title = "Copy answer";
  copyBtn.innerHTML = "📋";
  copyBtn.setAttribute("aria-label", "Copy answer");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(answer).then(() => {
      copyBtn.innerHTML = "✅";
      setTimeout(() => copyBtn.innerHTML = "📋", 2000);
      showToast("Copied to clipboard!");
    }).catch(() => showToast("Failed to copy", "error"));
  });
  bubble.appendChild(copyBtn);

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatWindow.appendChild(wrap);
  scrollToBottom();
}

function showTypingIndicator() {
  const el = document.createElement("div");
  el.className = "typing-indicator";
  el.innerHTML = `
    <div class="message-avatar" style="background:var(--accent-user-bg)">🤖</div>
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>`;
  chatWindow.appendChild(el);
  scrollToBottom();
  return el;
}

function removeTypingIndicator(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

/* ============================================================
   CHAT — Event Listeners
   ============================================================ */
sendBtn.addEventListener("click", sendMessage);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

userInput.addEventListener("input", () => {
  charCount.textContent = userInput.value.length;
  autoResizeTextarea();
});

// Suggestion chips
suggestionChips.forEach(chip => {
  chip.addEventListener("click", () => {
    userInput.value = chip.dataset.query;
    autoResizeTextarea();
    sendMessage();
  });
});

/* ============================================================
   CLEAR CHAT
   ============================================================ */
clearChatBtn.addEventListener("click", () => {
  if (!conversationLog.length && !chatWindow.children.length) return;
  if (!confirm("Clear the conversation?")) return;
  chatWindow.innerHTML = "";
  conversationLog = [];
  welcomeBanner.classList.remove("hidden");
  showToast("Conversation cleared.");
});

/* ============================================================
   EXPORT CONVERSATION
   ============================================================ */
exportBtn.addEventListener("click", () => {
  if (!conversationLog.length) { showToast("No conversation to export."); return; }
  const lines = conversationLog.map(m => `[${m.time}] ${m.role}: ${m.text}`).join("\n\n");
  const blob  = new Blob(["FAQ Chatbot — Conversation Export\n" + "=".repeat(40) + "\n\n" + lines], { type: "text/plain" });
  const a     = document.createElement("a");
  a.href      = URL.createObjectURL(blob);
  a.download  = `techbot-chat-${Date.now()}.txt`;
  a.click();
  showToast("Conversation exported!");
});

/* ============================================================
   TEXT-TO-SPEECH
   ============================================================ */
ttsToggleBtn.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  ttsToggleBtn.classList.toggle("active", ttsEnabled);
  ttsToggleBtn.setAttribute("aria-pressed", ttsEnabled);
  showToast(ttsEnabled ? "🔊 TTS enabled" : "🔇 TTS disabled");
});

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel(); // Cancel any ongoing speech
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate  = 1.0;
  utter.pitch = 1.0;
  utter.lang  = "en-US";
  // Prefer a natural voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.name.includes("Google") || v.name.includes("Natural") || v.lang === "en-US");
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

/* ============================================================
   SPEECH-TO-TEXT
   ============================================================ */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous    = false;
  recognition.interimResults= true;
  recognition.lang          = "en-US";

  recognition.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add("recording");
    voiceBtn.title = "Listening… (click to stop)";
    showToast("🎤 Listening…");
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    userInput.value = transcript;
    charCount.textContent = transcript.length;
    autoResizeTextarea();
    if (event.results[event.results.length - 1].isFinal) {
      sendMessage();
    }
  };

  recognition.onerror = (e) => {
    showToast("🎤 Voice error: " + e.error, "error");
    stopRecording();
  };

  recognition.onend = stopRecording;

  voiceBtn.addEventListener("click", () => {
    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch {
        showToast("Could not start voice input.", "error");
      }
    }
  });
} else {
  // No Speech API support
  voiceBtn.title = "Speech recognition not supported in this browser";
  voiceBtn.style.opacity = "0.4";
  voiceBtn.style.cursor  = "not-allowed";
}

function stopRecording() {
  isRecording = false;
  voiceBtn.classList.remove("recording");
  voiceBtn.title = "Voice input";
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */
themeToggleBtn.addEventListener("click", toggleTheme);

/* ============================================================
   UTILITIES
   ============================================================ */
function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function autoResizeTextarea() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px";
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  initTheme();
  loadFaqs();
  userInput.focus();

  // Restore theme label
  const theme = document.documentElement.getAttribute("data-theme");
  themeToggleBtn.textContent = theme === "dark" ? "🌙" : "☀️";
}

init();
