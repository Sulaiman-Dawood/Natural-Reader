const $ = (id) => document.getElementById(id);
const root = $("root");

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>'
};
const TEXT = {
  idle: "Select text, or press Read aloud to hear the whole page. While it reads, click any sentence on the page to jump to it.",
  loading: "Getting the voice ready…"
};

for (let i = 0; i < 30; i++) {
  const bar = document.createElement("i");
  bar.style.setProperty("--i", i);
  bar.style.setProperty("--h", 10 + Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 30) + "px");
  $("wave").appendChild(bar);
}

let status = { state: "idle" }, nowReading = "", progress = null;
const send = (type, extra = {}) => chrome.runtime.sendMessage({ target: "background", type, ...extra });
const isActive = () => ["loading", "playing", "paused"].includes(status.state);

function render() {
  const state = status.state || "idle", active = isActive();
  root.dataset.state = state;
  const [icon, label] = state === "paused" ? [ICONS.play, "Resume"] : active ? [ICONS.pause, "Pause"] : [ICONS.play, "Read aloud"];
  $("toggle").innerHTML = `${icon}<span>${label}</span>`;
  for (const id of ["prev", "next", "stop"]) $(id).disabled = !active;
  const quote = nowReading ? `“${nowReading}”` : "";
  $("status").textContent =
    state === "error" ? status.message :
    state === "playing" ? quote || "Reading aloud…" :
    state === "paused" ? quote || "Paused" :
    TEXT[state] || TEXT.idle;
  $("progress").textContent = active && progress && progress.total
    ? `${state === "paused" ? "Paused · " : ""}Sentence ${progress.index + 1} of ${progress.total}` : "";
}

function showSpeed(v) {
  $("speed").value = v;
  $("speedOut").textContent = Number(v).toFixed(2) + "×";
  $("speed").style.setProperty("--fill", ((v - 0.5) / 1.5) * 100 + "%");
}

chrome.storage.local.get({ lastStatus: null }).then((s) => { if (s.lastStatus) status = s.lastStatus; render(); });
chrome.storage.session.get({ nowReading: "", progress: null }).then((s) => { nowReading = s.nowReading; progress = s.progress; render(); });
chrome.storage.onChanged.addListener((c) => {
  if (c.lastStatus) status = c.lastStatus.newValue || { state: "idle" };
  if (c.nowReading) nowReading = c.nowReading.newValue || "";
  if (c.progress) progress = c.progress.newValue;
  if (c.speed) showSpeed(c.speed.newValue);
  if (c.lastStatus || c.nowReading || c.progress) render();
});

loadStore().then((store) => {
  const s = { ...profileFor(store, store.provider) };
  const meta = $("meta");
  if (s.apiKey || s.noKey) {
    meta.textContent = `${PRESETS[store.provider].label} · ${voiceName(store.provider, s.voice) || "default voice"}`;
  } else {
    meta.textContent = "Add your API key in Settings";
    meta.classList.add("warn");
  }
  showSpeed(store.speed);
  $("underline").checked = store.underline;
});

function toggle() {
  if (status.state === "paused") send("resume");
  else if (isActive()) send("pause");
  else send("read-active-tab");
}

$("toggle").onclick = toggle;
$("prev").onclick = () => send("seek", { delta: -1 });
$("next").onclick = () => send("seek", { delta: 1 });
$("stop").onclick = () => send("stop");
$("speed").oninput = () => showSpeed($("speed").value);
$("speed").onchange = () => chrome.storage.local.set({ speed: Number($("speed").value) });
$("underline").onchange = () => chrome.storage.local.set({ underline: $("underline").checked });
$("settings").onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };

// Space pauses or resumes; the arrow keys skip sentences (unless the speed slider has focus).
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, button") && e.key === " ") return;
  if (e.key === " ") { e.preventDefault(); toggle(); }
  if (e.target.id === "speed") return;
  if (e.key === "ArrowLeft" && isActive()) send("seek", { delta: -1 });
  if (e.key === "ArrowRight" && isActive()) send("seek", { delta: 1 });
});

chrome.commands.getAll().then((cmds) => {
  const keys = $("keys");
  const label = { "read-selection": "Read", "pause-resume": "Pause", "stop-reading": "Stop", "previous-sentence": "Back", "next-sentence": "Skip" };
  let any = false;
  for (const c of cmds) {
    if (!label[c.name] || !c.shortcut) continue;
    any = true;
    const span = document.createElement("span");
    for (const k of c.shortcut.split("+")) {
      const kbd = document.createElement("kbd");
      kbd.textContent = k;
      span.append(kbd);
    }
    span.append(" " + label[c.name]);
    keys.append(span);
  }
  if (!any) {
    const b = document.createElement("button");
    b.textContent = "Set a keyboard shortcut";
    b.onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    keys.append(b);
  }
});
