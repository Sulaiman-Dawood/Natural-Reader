importScripts("shared.js");

let lastTabId = null;

function friendlyError(raw) {
  const m = String(raw);
  if (/terms/i.test(m)) return "The provider needs you to accept this model's terms first. Open the provider's console, accept them, then try again. Details: " + m.slice(0, 200);
  if (/^401|invalid api key|api key not valid|unauthorized/i.test(m)) return "The API key was rejected. Check it in Settings.";
  if (/^403/.test(m)) return "The key was accepted but isn't allowed to use this model. Check the key's project and access. Details: " + m.slice(0, 200);
  if (/^404/.test(m)) return "Endpoint or model not found. Check the base URL and model under Advanced. Details: " + m.slice(0, 200);
  if (/^429/.test(m)) return "Rate limit reached. Wait a moment, then try again.";
  if (/Failed to fetch/i.test(m)) return "Could not reach the server. Check your connection and the base URL. For a local model, make sure its server is running.";
  return m.slice(0, 300);
}

async function setStatus(state, message = "") {
  await chrome.storage.local.set({ lastStatus: { state, message, at: Date.now() } });
  const running = state === "loading" || state === "playing";
  chrome.contextMenus.update("main", { title: running ? "Stop reading" : "Read aloud" }, () => void chrome.runtime.lastError);
  const map = { loading: ["…", "#888"], playing: ["▶", "#2a9d4a"], error: ["!", "#d33"], idle: ["", "#000"] };
  const [text, color] = map[state] || map.idle;
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  if (state === "error") toast(message);
}

async function toast(text) {
  if (!lastTabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: lastTabId },
      args: [text],
      func: (t) => {
        document.getElementById("nr-toast")?.remove();
        const d = document.createElement("div");
        d.id = "nr-toast";
        d.textContent = "Natural Reader: " + t;
        d.style.cssText =
          "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:12px 14px;" +
          "border-radius:10px;background:#1b1f2a;color:#fff;font:14px/1.4 system-ui,sans-serif;" +
          "box-shadow:0 6px 24px rgba(0,0,0,.35);border-left:4px solid #ff6b73";
        document.documentElement.appendChild(d);
        setTimeout(() => d.remove(), 9000);
      }
    });
  } catch (e) { /* page does not allow injection */ }
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play synthesized speech audio"
  });
}

async function sendToOffscreen(msg) {
  await ensureOffscreen();
  for (let i = 0; i < 30; i++) {
    try {
      const r = await chrome.runtime.sendMessage({ target: "offscreen", ...msg });
      if (r && r.ok) return;
    } catch (e) { /* offscreen page still loading */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("The audio player did not start. Reload the extension and try again.");
}

async function readText(text, override) {
  text = (text || "").trim();
  if (!text) return setStatus("error", "Select some text first.");
  const settings = { ...(await loadSettings()), ...(override || {}) };
  if (!settings.apiKey && !settings.noKey) return setStatus("error", "Add your API key in Settings first.");
  if (!settings.baseUrl || !settings.model) return setStatus("error", "Base URL and model are required. See Settings > Advanced.");
  await setStatus("loading");
  try {
    await sendToOffscreen({ type: "speak", text, settings });
  } catch (e) {
    setStatus("error", e.message);
  }
}

async function stopReading() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) { try { await chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }); } catch (e) {} }
  setStatus("idle");
}

const MAX_PAGE_CHARS = 20000;

function extractPageText() {
  const skip =
    "nav,header,footer,aside,script,style,noscript,form,button,select,textarea," +
    "[aria-hidden='true'],[role='navigation'],[role='banner'],[role='complementary'],[role='contentinfo']";
  const candidates = [...document.querySelectorAll("article,main,[role='main']")];
  let root = document.body;
  if (candidates.length) {
    const best = candidates.reduce((a, b) => (b.textContent.length > a.textContent.length ? b : a));
    if (best.textContent.trim().length > 500) root = best;
  }
  const lines = [];
  let lastBlock = null, line = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const el = n.parentElement;
      if (!el || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (el.closest(skip) || !el.getClientRects().length) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const blockOf = (el) => el.closest("p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th,figcaption,div") || el;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const block = blockOf(n.parentElement);
    if (block !== lastBlock && line) { lines.push(line.trim()); line = ""; }
    lastBlock = block;
    line += n.nodeValue.replace(/\s+/g, " ");
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

async function readTab(tab, selectionText) {
  if (!tab || !tab.id) return setStatus("error", "No active page to read from.");
  lastTabId = tab.id;
  let text = (selectionText || "").trim();
  try {
    if (!text) {
      const sel = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => String(window.getSelection())
      });
      text = (sel.map((r) => r.result).find((t) => t && t.trim()) || "").trim();
    }
    if (!text) {
      const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageText });
      text = ((res[0] && res[0].result) || "").trim().slice(0, MAX_PAGE_CHARS);
      if (!text) return setStatus("error", "No readable text found on this page.");
    }
  } catch (e) {
    return setStatus("error", "This page doesn't allow reading its text (browser pages and the web store are blocked).");
  }
  readText(text);
}

async function isRunning() {
  const { lastStatus } = await chrome.storage.local.get({ lastStatus: null });
  return !!lastStatus && (lastStatus.state === "loading" || lastStatus.state === "playing");
}

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  readTab(tab);
}

chrome.runtime.onInstalled.addListener(() => {
  setStatus("idle");
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "main", title: "Read aloud", contexts: ["all"] });
  });
});
chrome.runtime.onStartup.addListener(() => setStatus("idle"));

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "main") return;
  if (tab && tab.id) lastTabId = tab.id;
  if (await isRunning()) return stopReading();
  readTab(tab, info.selectionText);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "stop-reading") stopReading();
  if (command === "read-selection") readActiveTab();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "background") return;
  if (msg.type === "status") setStatus(msg.state, msg.state === "error" ? friendlyError(msg.message) : "");
  if (msg.type === "read") readText(msg.text, msg.override);
  if (msg.type === "read-active-tab") readActiveTab();
  if (msg.type === "stop") stopReading();
});
