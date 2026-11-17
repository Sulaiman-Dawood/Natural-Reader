importScripts("shared.js");

// Chrome stops this service worker when it's idle, which wipes plain variables, so the tab being
// read lives in session storage: { tabId, frameId }. frameId is null when the text can't be
// underlined (for example a PDF, or a test from the Settings page).
const setReading = (reading) => chrome.storage.session.set({ reading: reading || null, nowReading: "" });
const getReading = async () => (await chrome.storage.session.get({ reading: null })).reading;

const UNDERLINE_CSS =
  "::highlight(natural-reader){text-decoration:underline 3px #3b5bff;text-underline-offset:4px;" +
  "text-decoration-skip-ink:none;background-color:rgba(59,91,255,.10)}";

function friendlyError(raw) {
  const m = String(raw);
  if (/terms/i.test(m)) return "The provider needs you to accept this model's terms first. Open the provider's console, accept them, then try again. Details: " + m.slice(0, 200);
  if (/^401|invalid api key|api key not valid|unauthorized/i.test(m)) return "The API key was rejected. Check it in Settings.";
  if (/^403/.test(m)) return "The key was accepted but isn't allowed to use this model. Check the key's project and access. Details: " + m.slice(0, 200);
  if (/^404/.test(m)) return "Endpoint or model not found. Check the base URL and model under Advanced. Details: " + m.slice(0, 200);
  if (/insufficient_quota/i.test(m)) return "Your account with this provider is out of credit or quota. Check billing on the provider's site.";
  if (/^429/.test(m)) return "Rate limit reached, even after retrying. Wait a minute, then try again.";
  if (/Failed to fetch/i.test(m)) return "Could not reach the server. Check your connection and the base URL. For a local model, make sure its server is running. For a custom address, open Settings and allow access.";
  return m.slice(0, 300);
}

// Sends a message to the page script in the frame being read, if there is one.
async function toPage(msg) {
  const reading = await getReading();
  if (!reading || reading.frameId == null) return;
  chrome.tabs.sendMessage(reading.tabId, { target: "page", ...msg }, { frameId: reading.frameId }).catch(() => {});
}

async function setStatus(state, message = "") {
  await chrome.storage.local.set({ lastStatus: { state, message, at: Date.now() } });
  const running = state === "loading" || state === "playing" || state === "paused";
  chrome.contextMenus.update("main", { title: running ? "Stop reading" : "Read aloud" }, () => void chrome.runtime.lastError);
  const map = { loading: ["…", "#6b7280"], playing: ["▶", "#3b5bff"], paused: ["❚❚", "#6b7280"], error: ["!", "#d0303f"], idle: ["", "#000"] };
  const [text, color] = map[state] || map.idle;
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  if (!running) {
    chrome.storage.session.set({ nowReading: "", progress: null });
    toPage({ type: "clear" });
  }
  if (state === "error") toast(message);
}

async function toast(text) {
  const reading = await getReading();
  if (!reading) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: reading.tabId },
      args: [text],
      func: (t) => {
        document.getElementById("nr-toast")?.remove();
        const d = document.createElement("div");
        d.id = "nr-toast";
        d.textContent = "Natural Reader: " + t;
        d.style.cssText =
          "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:380px;padding:12px 16px;" +
          "border-radius:12px;background:#151827;color:#eceefa;font:14px/1.45 system-ui,sans-serif;" +
          "box-shadow:0 12px 40px rgba(0,0,0,.35);border-left:4px solid #ff6b7a";
        document.documentElement.appendChild(d);
        setTimeout(() => d.remove(), 9000);
      }
    });
  } catch (e) { /* page does not allow injection */ }
}

let creatingOffscreen = null;
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  // Two quick reads must not both try to create it.
  creatingOffscreen = creatingOffscreen || chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play synthesized speech audio"
  }).finally(() => (creatingOffscreen = null));
  await creatingOffscreen;
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

async function offscreenOpen() {
  return (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length > 0;
}

// Reads `text` from position `from`. The text and position are kept in session storage so a
// reading can restart where it was if Chrome closes the audio player during a long pause.
async function readText(text, override, from = 0) {
  if (!from) text = (text || "").trim();
  if (!text) return setStatus("error", "Select some text first.");
  const settings = { ...(await loadSettings()), ...(override || {}) };
  if (!settings.apiKey && !settings.noKey) return setStatus("error", "Add your API key in Settings first.");
  if (!settings.baseUrl || !settings.model) return setStatus("error", "Base URL and model are required. See Settings > Advanced.");
  await chrome.storage.session.set({ track: { text, override: override || null, pos: from } });
  await setStatus("loading");
  try {
    await sendToOffscreen({ type: "speak", text, settings, from });
  } catch (e) {
    setStatus("error", e.message);
  }
}

async function stopReading() {
  if (await offscreenOpen()) {
    try { await chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }); } catch (e) {}
  }
  setStatus("idle");
}

// Runs the page script in the tab: first looks for a selection in any frame, then falls back to
// the main frame's article text. Returns { text, frameId, mapped }.
async function collectFromTab(tabId) {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] });
  const selections = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => window.__naturalReader && window.__naturalReader.collect({ selectionOnly: true })
  });
  const hit = selections.find((r) => r.result && r.result.text.trim());
  if (hit) return { ...hit.result, frameId: hit.frameId };
  const [page] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__naturalReader && window.__naturalReader.collect()
  });
  return { ...(page && page.result), frameId: 0 };
}

async function readTab(tab, selectionText) {
  if (!tab || !tab.id) return setStatus("error", "No active page to read from.");
  let found = null;
  try {
    found = await collectFromTab(tab.id);
  } catch (e) { /* browser pages, the web store and PDFs don't allow scripts */ }
  if (!found || !found.text) {
    // The right-click menu still knows the selection on pages scripts can't run in, like PDFs.
    if (selectionText && selectionText.trim()) found = { text: selectionText, mapped: false };
    else if (!found) return setStatus("error", "This page doesn't allow reading its text (browser pages and the web store are blocked).");
    else return setStatus("error", "No readable text found on this page.");
  }
  const frameId = found.mapped ? found.frameId : null;
  await setReading({ tabId: tab.id, frameId });
  if (frameId != null) {
    chrome.scripting.insertCSS({ target: { tabId: tab.id, frameIds: [frameId] }, css: UNDERLINE_CSS }).catch(() => {});
  }
  readText(found.text);
}

async function onProgress({ start, end, text, index, total }) {
  const { track } = await chrome.storage.session.get({ track: null });
  if (track) track.pos = start;
  chrome.storage.session.set({ nowReading: text || "", progress: { index, total }, ...(track && { track }) });
  const { underline, follow } = await chrome.storage.local.get({ underline: true, follow: true });
  toPage({ type: "underline", start, end, follow, show: underline });
}

async function currentState() {
  const { lastStatus } = await chrome.storage.local.get({ lastStatus: null });
  return (lastStatus && lastStatus.state) || "idle";
}

async function isRunning() {
  return ["loading", "playing", "paused"].includes(await currentState());
}

// Sends a control message to the audio player. True if it still had the reading loaded.
async function control(type, extra = {}) {
  if (!(await offscreenOpen())) return false;
  try {
    const r = await chrome.runtime.sendMessage({ target: "offscreen", type, ...extra });
    return !!(r && r.active);
  } catch (e) {
    return false;
  }
}

// Restarts from the saved position when the player was closed (a long pause).
async function restart(pos) {
  const { track } = await chrome.storage.session.get({ track: null });
  if (!track) return setStatus("idle");
  readText(track.text, track.override, pos != null ? pos : track.pos);
}

async function resumeReading() {
  if (!(await control("resume"))) restart();
}

// Moves by `delta` sentences, or to the sentence at text position `pos`.
async function seek({ delta, pos }) {
  if (!(await isRunning())) return;
  if (pos != null ? await control("seek-pos", { pos }) : await control("seek", { delta })) return;
  restart(pos);
}

async function togglePause() {
  const state = await currentState();
  if (state === "paused") resumeReading();
  else if (state === "playing" || state === "loading") control("pause");
  else readActiveTab();
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
  if (await isRunning()) return stopReading();
  readTab(tab, info.selectionText);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "stop-reading") stopReading();
  if (command === "read-selection") readActiveTab();
  if (command === "pause-resume") togglePause();
  if (command === "previous-sentence") seek({ delta: -1 });
  if (command === "next-sentence") seek({ delta: 1 });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "background") return;
  if (msg.type === "status") setStatus(msg.state, msg.state === "error" ? friendlyError(msg.message) : "");
  if (msg.type === "progress") onProgress(msg);
  // Tests and previews come from the Settings page, which shows its own errors and has no
  // page to underline.
  if (msg.type === "read") setReading(null).then(() => readText(msg.text, msg.override));
  if (msg.type === "read-active-tab") readActiveTab();
  if (msg.type === "stop") stopReading();
  if (msg.type === "pause") control("pause");
  if (msg.type === "resume") resumeReading();
  if (msg.type === "toggle-pause") togglePause();
  if (msg.type === "seek") seek(msg); // { delta } from the popup, or { pos } from a click on the page
});

// Speed and underline changes from the popup or Settings apply to the reading in progress.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.speed && (await offscreenOpen())) {
    chrome.runtime.sendMessage({ target: "offscreen", type: "speed", speed: changes.speed.newValue }).catch(() => {});
  }
  if (changes.underline && changes.underline.newValue === false) toPage({ type: "clear" });
});
