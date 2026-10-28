const $ = (id) => document.getElementById(id);
const FIELDS = ["apiKey", "baseUrl", "model", "voice", "format", "maxChars"];
let store, current, shown = [], activeIdx = 0;

function buildProviders() {
  const box = $("providers");
  for (const [id, p] of Object.entries(PRESETS)) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="provider" value="${id}"><span>${p.label}</span>`;
    box.appendChild(label);
  }
  box.addEventListener("change", (e) => {
    if (e.target.name !== "provider") return;
    store.profiles[current] = readForm();
    current = e.target.value;
    closePanel();
    fillForm();
  });
}

function readForm() {
  const o = {};
  FIELDS.forEach((f) => (o[f] = $(f).value.trim()));
  o.maxChars = Number(o.maxChars) || PRESETS[current].maxChars;
  return o;
}

function fillForm() {
  const p = profileFor(store, current);
  FIELDS.forEach((f) => ($(f).value = p[f]));
  document.querySelector(`input[name=provider][value=${current}]`).checked = true;
  $("keyRow").style.display = PRESETS[current].noKey ? "none" : "";
  $("localHint").hidden = !PRESETS[current].noKey;
  $("formatRow").style.display = PRESETS[current].kind === "gemini" ? "none" : "";
  const url = PRESETS[current].keyUrl;
  $("keyHint").innerHTML = url
    ? `Get a key at <a href="${url}" target="_blank" rel="noreferrer">${new URL(url).host}</a>. Stored only in this browser.`
    : "Stored only in this browser.";
  const hasList = PRESETS[current].voices.length > 0;
  $("picker").hidden = !hasList;
  $("voice").style.display = hasList ? "none" : "";
  renderVoiceButton();
}

/* ---------- narrator picker ---------- */
const live = {};
const voices = () => live[current] || PRESETS[current].voices;

async function loadLiveVoices() {
  const key = current;
  if (!PRESETS[key].noKey) return;
  try {
    const base = $("baseUrl").value.trim().replace(/\/+$/, "");
    const r = await fetch(base + "/audio/voices");
    if (!r.ok) return;
    const j = await r.json();
    const names = (j.voices || []).map((v) => (typeof v === "string" ? v : v.name || v.id)).filter(Boolean);
    if (names.length)
      live[key] = names.map((name) => ({ name, tag: (PRESETS.local.voices.find((x) => x.name === name) || {}).tag || "" }));
  } catch (e) { /* server not running: keep the built-in list */ }
}

function renderVoiceButton() {
  const name = $("voice").value;
  const known = voices().find((v) => v.name.toLowerCase() === name.toLowerCase());
  $("voiceName").textContent = name || "Choose a voice";
  $("voiceTag").textContent = known ? known.tag : name ? "Custom" : "";
}

function openPanel() {
  $("voicePanel").hidden = false;
  $("voiceBtn").setAttribute("aria-expanded", "true");
  $("voiceFilter").value = "";
  $("voiceOther").value = "";
  renderList();
  $("voiceFilter").focus();
  loadLiveVoices().then(() => { if (!$("voicePanel").hidden) renderList(); });
}

function closePanel() {
  if ($("voicePanel").hidden) return;
  $("voicePanel").hidden = true;
  $("voiceBtn").setAttribute("aria-expanded", "false");
}

function renderList() {
  const q = $("voiceFilter").value.trim().toLowerCase();
  const cur = $("voice").value.toLowerCase();
  shown = voices().filter((v) => !q || v.name.toLowerCase().includes(q) || (v.tag || "").toLowerCase().includes(q));
  const ul = $("voiceList");
  ul.innerHTML = "";
  if (!shown.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No match. Type a custom name below.";
    ul.appendChild(li);
    return;
  }
  shown.forEach((v, i) => {
    const li = document.createElement("li");
    li.id = "voice-" + i;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(v.name.toLowerCase() === cur));
    li.innerHTML = '<span class="vn"></span><span class="vt"></span><button type="button" class="vp"></button>';
    li.querySelector(".vn").textContent = v.name;
    li.querySelector(".vt").textContent = v.tag || "";
    const pv = li.querySelector(".vp");
    pv.textContent = "▶ Preview";
    pv.setAttribute("aria-label", "Preview " + v.name);
    pv.onclick = (e) => { e.stopPropagation(); preview(v.name); };
    li.onmousedown = (e) => e.preventDefault();
    li.onclick = () => choose(v.name);
    li.onmousemove = () => setActive(i, false);
    ul.appendChild(li);
  });
  const sel = shown.findIndex((v) => v.name.toLowerCase() === cur);
  setActive(sel >= 0 ? sel : 0, true);
}

function setActive(i, scroll) {
  activeIdx = Math.max(0, Math.min(shown.length - 1, i));
  [...$("voiceList").children].forEach((li, n) => li.classList.toggle("active", n === activeIdx));
  const li = $("voiceList").children[activeIdx];
  if (li && shown.length) {
    $("voiceFilter").setAttribute("aria-activedescendant", li.id);
    if (scroll) li.scrollIntoView({ block: "nearest" });
  }
}

function choose(name) {
  if (!name) return;
  $("voice").value = name;
  renderVoiceButton();
  closePanel();
  $("voiceBtn").focus();
}

function preview(name) {
  const override = { ...readForm(), voice: name, kind: PRESETS[current].kind, noKey: PRESETS[current].noKey };
  chrome.runtime.sendMessage({
    target: "background", type: "read",
    text: `Hi, I'm ${name}. This is how I sound.`, override
  });
}

function wirePicker() {
  $("voiceBtn").onclick = () => ($("voicePanel").hidden ? openPanel() : closePanel());
  $("voiceBtn").onkeydown = (e) => { if (e.key === "ArrowDown") { e.preventDefault(); openPanel(); } };
  $("voiceFilter").oninput = renderList;
  $("voiceFilter").onkeydown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1, true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1, true); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0, true); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1, true); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[activeIdx]) choose(shown[activeIdx].name); }
    else if (e.key === "Escape") { e.preventDefault(); closePanel(); $("voiceBtn").focus(); }
  };
  $("voiceOther").onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); choose($("voiceOther").value.trim()); }
    if (e.key === "Escape") { e.preventDefault(); closePanel(); $("voiceBtn").focus(); }
  };
  document.addEventListener("mousedown", (e) => { if (!$("picker").contains(e.target)) closePanel(); });
}

/* ---------- status + actions ---------- */
function showStatus(st) {
  const state = (st && st.state) || "idle";
  $("strip").dataset.state = state;
  $("stripText").textContent =
    state === "error" ? st.message : state === "loading" ? "Generating speech…" : state === "playing" ? "Reading aloud." : "Ready.";
}

async function save() {
  store.profiles[current] = readForm();
  store.speed = Number($("speed").value);
  await chrome.storage.local.set({
    provider: current,
    speed: store.speed,
    profiles: store.profiles,
    lastStatus: { state: "idle", message: "", at: Date.now() }
  });
  const s = $("saved");
  s.classList.add("on");
  setTimeout(() => s.classList.remove("on"), 1600);
}

(async () => {
  store = await loadStore();
  current = store.provider;
  buildProviders();
  wirePicker();
  fillForm();
  $("speed").value = store.speed;
  $("speedOut").textContent = Number(store.speed).toFixed(2) + "×";
  $("speed").addEventListener("input", () => ($("speedOut").textContent = Number($("speed").value).toFixed(2) + "×"));
  chrome.storage.local.get({ lastStatus: null }).then((s) => showStatus(s.lastStatus));
  chrome.storage.onChanged.addListener((c) => { if (c.lastStatus) showStatus(c.lastStatus.newValue); });

  $("reveal").onclick = () => {
    const show = $("apiKey").type === "password";
    $("apiKey").type = show ? "text" : "password";
    $("reveal").textContent = show ? "Hide" : "Show";
  };
  $("save").onclick = save;
  $("test").onclick = async () => {
    await save();
    chrome.runtime.sendMessage({ target: "background", type: "read", text: "Hello! This is a test of your text to speech setup." });
  };
  $("stop").onclick = () => chrome.runtime.sendMessage({ target: "background", type: "stop" });
})();
