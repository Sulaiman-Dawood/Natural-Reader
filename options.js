const $ = (id) => document.getElementById(id);
const FIELDS = ["apiKey", "baseUrl", "model", "voice", "format", "maxChars"];
let store, current, shown = [], activeIdx = 0;

/* ---------- provider picker ---------- */
let shownP = [], activeP = 0;

function renderProviderButton() {
  const p = PRESETS[current];
  $("providerName").textContent = p.label;
  $("providerTag").textContent = p.desc || "";
}

function openProviderPanel() {
  $("providerPanel").hidden = false;
  $("providerBtn").setAttribute("aria-expanded", "true");
  $("providerFilter").value = "";
  renderProviderList();
  $("providerFilter").focus();
}

function closeProviderPanel() {
  if ($("providerPanel").hidden) return;
  $("providerPanel").hidden = true;
  $("providerBtn").setAttribute("aria-expanded", "false");
}

function renderProviderList() {
  const q = $("providerFilter").value.trim().toLowerCase();
  shownP = Object.entries(PRESETS).filter(([id, p]) => !q || p.label.toLowerCase().includes(q) || (p.desc || "").toLowerCase().includes(q));
  const ul = $("providerList");
  ul.innerHTML = "";
  if (!shownP.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No match.";
    ul.appendChild(li);
    return;
  }
  shownP.forEach(([id, p], i) => {
    const li = document.createElement("li");
    li.id = "provider-" + i;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(id === current));
    li.innerHTML = '<span class="vn"></span><span class="vt"></span>';
    li.querySelector(".vn").textContent = p.label;
    li.querySelector(".vt").textContent = p.desc || "";
    li.onmousedown = (e) => e.preventDefault();
    li.onclick = () => chooseProvider(id);
    li.onmousemove = () => setActiveProvider(i, false);
    ul.appendChild(li);
  });
  const sel = shownP.findIndex(([id]) => id === current);
  setActiveProvider(sel >= 0 ? sel : 0, true);
}

function setActiveProvider(i, scroll) {
  activeP = Math.max(0, Math.min(shownP.length - 1, i));
  [...$("providerList").children].forEach((li, n) => li.classList.toggle("active", n === activeP));
  const li = $("providerList").children[activeP];
  if (li && shownP.length) {
    $("providerFilter").setAttribute("aria-activedescendant", li.id);
    if (scroll) li.scrollIntoView({ block: "nearest" });
  }
}

function chooseProvider(id) {
  closeProviderPanel();
  $("providerBtn").focus();
  if (id === current) return;
  store.profiles[current] = readForm();
  current = id;
  closePanel();
  closeModelPanel();
  fillForm();
}

function buildProviders() {
  $("providerBtn").onclick = () => ($("providerPanel").hidden ? openProviderPanel() : closeProviderPanel());
  $("providerBtn").onkeydown = (e) => { if (e.key === "ArrowDown") { e.preventDefault(); openProviderPanel(); } };
  $("providerFilter").oninput = renderProviderList;
  $("providerFilter").onkeydown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveProvider(activeP + 1, true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveProvider(activeP - 1, true); }
    else if (e.key === "Home") { e.preventDefault(); setActiveProvider(0, true); }
    else if (e.key === "End") { e.preventDefault(); setActiveProvider(shownP.length - 1, true); }
    else if (e.key === "Enter") { e.preventDefault(); if (shownP[activeP]) chooseProvider(shownP[activeP][0]); }
    else if (e.key === "Escape") { e.preventDefault(); closeProviderPanel(); $("providerBtn").focus(); }
  };
  document.addEventListener("mousedown", (e) => { if (!$("providerPicker").contains(e.target)) closeProviderPanel(); });
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
  renderProviderButton();
  $("keyRow").style.display = PRESETS[current].noKey ? "none" : "";
  $("localHint").hidden = !PRESETS[current].noKey;
  $("formatRow").style.display = PRESETS[current].kind === "gemini" ? "none" : "";
  const url = PRESETS[current].keyUrl;
  $("keyHint").innerHTML = url
    ? `Get a key at <a href="${url}" target="_blank" rel="noreferrer">${new URL(url).host}</a>. Stored only in this browser.`
    : "Stored only in this browser.";

  const hasModels = (PRESETS[current].models || []).length > 0;
  $("modelPicker").hidden = !hasModels;
  $("model").style.display = hasModels ? "none" : "";
  renderModelButton();
  const hasList = PRESETS[current].voices.length > 0;
  $("picker").hidden = !hasList;
  $("voice").style.display = hasList ? "none" : "";
  renderVoiceButton();
}


/* ---------- model picker ---------- */
let shownM = [], activeM = 0;
const models = () => PRESETS[current].models || [];

function renderModelButton() {
  const id = $("model").value;
  const known = models().find((m) => m.id === id);
  $("modelName").textContent = known ? known.name : id || "Choose a model";
  $("modelTag").textContent = known ? known.tag : id ? "Custom" : "";
}

function openModelPanel() {
  $("modelPanel").hidden = false;
  $("modelBtn").setAttribute("aria-expanded", "true");
  $("modelFilter").value = "";
  $("modelOther").value = "";
  renderModelList();
  $("modelFilter").focus();
}

function closeModelPanel() {
  if ($("modelPanel").hidden) return;
  $("modelPanel").hidden = true;
  $("modelBtn").setAttribute("aria-expanded", "false");
}

function renderModelList() {
  const q = $("modelFilter").value.trim().toLowerCase();
  const cur = $("model").value;
  shownM = models().filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.tag.toLowerCase().includes(q));
  const ul = $("modelList");
  ul.innerHTML = "";
  if (!shownM.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No match. Type a custom model ID below.";
    ul.appendChild(li);
    return;
  }
  shownM.forEach((m, i) => {
    const li = document.createElement("li");
    li.id = "model-" + i;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(m.id === cur));
    li.innerHTML = '<span class="vn"></span><span class="vt"></span>';
    li.querySelector(".vn").textContent = m.name;
    li.querySelector(".vt").textContent = m.tag;
    li.onmousedown = (e) => e.preventDefault();
    li.onclick = () => chooseModel(m.id);
    li.onmousemove = () => setActiveModel(i, false);
    ul.appendChild(li);
  });
  const sel = shownM.findIndex((m) => m.id === cur);
  setActiveModel(sel >= 0 ? sel : 0, true);
}

function setActiveModel(i, scroll) {
  activeM = Math.max(0, Math.min(shownM.length - 1, i));
  [...$("modelList").children].forEach((li, n) => li.classList.toggle("active", n === activeM));
  const li = $("modelList").children[activeM];
  if (li && shownM.length) {
    $("modelFilter").setAttribute("aria-activedescendant", li.id);
    if (scroll) li.scrollIntoView({ block: "nearest" });
  }
}

function chooseModel(id) {
  if (!id) return;
  $("model").value = id;
  renderModelButton();
  closeModelPanel();
  $("modelBtn").focus();
}

function wireModelPicker() {
  $("modelBtn").onclick = () => ($("modelPanel").hidden ? openModelPanel() : closeModelPanel());
  $("modelBtn").onkeydown = (e) => { if (e.key === "ArrowDown") { e.preventDefault(); openModelPanel(); } };
  $("modelFilter").oninput = renderModelList;
  $("modelFilter").onkeydown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveModel(activeM + 1, true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveModel(activeM - 1, true); }
    else if (e.key === "Home") { e.preventDefault(); setActiveModel(0, true); }
    else if (e.key === "End") { e.preventDefault(); setActiveModel(shownM.length - 1, true); }
    else if (e.key === "Enter") { e.preventDefault(); if (shownM[activeM]) chooseModel(shownM[activeM].id); }
    else if (e.key === "Escape") { e.preventDefault(); closeModelPanel(); $("modelBtn").focus(); }
  };
  $("modelOther").onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); chooseModel($("modelOther").value.trim()); }
    if (e.key === "Escape") { e.preventDefault(); closeModelPanel(); $("modelBtn").focus(); }
  };
  document.addEventListener("mousedown", (e) => { if (!$("modelPicker").contains(e.target)) closeModelPanel(); });
}

/* ---------- narrator picker ---------- */
const vid = (v) => v.id || v.name;
const live = {};
const voices = () => live[current] || PRESETS[current].voices;

async function loadLiveVoices() {
  const key = current;
  if (PRESETS[key].kind === "elevenlabs") {
    const apiKey = $("apiKey").value.trim();
    if (!apiKey) return;
    try {
      const base = $("baseUrl").value.trim().replace(/\/+$/, "");
      const r = await fetch(base + "/voices", { headers: { "xi-api-key": apiKey } });
      if (!r.ok) return;
      const j = await r.json();
      const found = (j.voices || []).filter((v) => v.voice_id && v.name).map((v) => ({
        name: v.name, id: v.voice_id,
        tag: Object.values(v.labels || {}).slice(0, 3).join(", ") || v.category || ""
      }));
      if (found.length) live[key] = found;
    } catch (e) { /* offline or bad key: keep the built-in list */ }
    return;
  }
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
  const known = voices().find((v) => vid(v).toLowerCase() === name.toLowerCase());
  $("voiceName").textContent = known ? known.name : name || "Choose a voice";
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
  shown = voices().filter((v) => !q || vid(v).toLowerCase().includes(q) || v.name.toLowerCase().includes(q) || (v.tag || "").toLowerCase().includes(q));
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
    li.setAttribute("aria-selected", String(vid(v).toLowerCase() === cur));
    li.innerHTML = '<span class="vn"></span><span class="vt"></span><button type="button" class="vp"></button>';
    li.querySelector(".vn").textContent = v.name;
    li.querySelector(".vt").textContent = v.tag || "";
    const pv = li.querySelector(".vp");
    pv.textContent = "▶ Preview";
    pv.setAttribute("aria-label", "Preview " + v.name);
    pv.onclick = (e) => { e.stopPropagation(); preview(vid(v)); };
    li.onmousedown = (e) => e.preventDefault();
    li.onclick = () => choose(vid(v));
    li.onmousemove = () => setActive(i, false);
    ul.appendChild(li);
  });
  const sel = shown.findIndex((v) => vid(v).toLowerCase() === cur);
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

function preview(id) {
  const v = voices().find((x) => vid(x) === id);
  const override = { ...readForm(), voice: id, kind: PRESETS[current].kind, noKey: PRESETS[current].noKey };
  chrome.runtime.sendMessage({
    target: "background", type: "read",
    text: `Hi, I'm ${v ? v.name : id}. This is how I sound.`, override
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
    else if (e.key === "Enter") { e.preventDefault(); if (shown[activeIdx]) choose(vid(shown[activeIdx])); }
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
  wireModelPicker();
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
