const $ = (id) => document.getElementById(id);
const root = $("root");

const wave = $("wave");
for (let i = 0; i < 30; i++) {
  const bar = document.createElement("i");
  const h = 10 + Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 34);
  bar.style.setProperty("--i", i);
  bar.style.setProperty("--h", h + "px");
  wave.appendChild(bar);
}

const TEXT = {
  idle: "Ready. Press Read to hear your selection, or the whole page if nothing is selected.",
  loading: "Generating speech…",
  playing: "Reading aloud"
};

function render(st) {
  const state = (st && st.state) || "idle";
  root.dataset.state = state;
  $("status").textContent = state === "error" ? st.message : TEXT[state];
}

chrome.storage.local.get({ lastStatus: null }).then((s) => render(s.lastStatus));
chrome.storage.onChanged.addListener((c) => { if (c.lastStatus) render(c.lastStatus.newValue); });

loadSettings().then((s) => {
  $("meta").textContent = (s.apiKey || s.noKey)
    ? `Using ${PRESETS[s.provider].label}, voice ${s.voice || "default"}`
    : "No API key yet. Add one in Settings.";
});

$("read").onclick = () => chrome.runtime.sendMessage({ target: "background", type: "read-active-tab" });
$("stop").onclick = () => chrome.runtime.sendMessage({ target: "background", type: "stop" });
$("settings").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); window.close(); };
