const $ = (id) => document.getElementById(id);
const FIELDS = ["apiKey", "baseUrl", "model", "voice", "format", "maxChars"];
const ICON = {
  chevron: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5l5 5 5-5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>'
};

let store;         // everything saved in chrome.storage.local
let current;       // the selected provider's id
let profile;       // the selected provider's editable settings
let running = false;
const live = {};   // voices fetched from the provider, by provider id

const preset = () => PRESETS[current];
const voices = () => (live[current] || preset().voices).map((v) => ({ id: v.id || v.name, name: v.name, tag: v.tag || "" }));
const models = () => (preset().models || []).map((m) => ({ id: m.id, name: m.name, tag: m.tag || "" }));

/* ---------- saving ---------- */

let saveTimer = null;
function save(delay = 300) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, delay);
}

async function saveNow() {
  clearTimeout(saveTimer);
  store.profiles[current] = Object.fromEntries(FIELDS.map((f) => [f, profile[f]]));
  await chrome.storage.local.set({
    provider: current, speed: store.speed, profiles: store.profiles, underline: store.underline, follow: store.follow
  });
  const t = $("toast");
  t.classList.add("on");
  clearTimeout(t.timer);
  t.timer = setTimeout(() => t.classList.remove("on"), 1400);
}

/* ---------- access to custom addresses ---------- */

const originOf = (url) => {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch (e) {
    return null;
  }
};

// Built-in providers are allowed by manifest.json. Any other address (Custom, or a voice server on
// another computer) needs the user's OK, which Chrome only asks for during a click. It resolves
// right away, without a prompt, if access is already granted.
function requestHostAccess() {
  const origin = originOf(profile.baseUrl);
  if (!origin) return Promise.resolve(true);
  return chrome.permissions.request({ origins: [origin + "/*"] }).catch(() => false);
}

async function checkAccess() {
  const origin = originOf(profile.baseUrl);
  const ok = !origin || (await chrome.permissions.contains({ origins: [origin + "/*"] }).catch(() => true));
  $("accessBanner").hidden = ok;
  if (!ok) $("accessText").textContent = `Natural Reader needs your permission to contact ${new URL(origin).host}.`;
}

/* ---------- searchable picker (models and voices) ---------- */

// Builds a dropdown with search, keyboard navigation and a box for typing your own value.
function createPicker(host, { labelId, placeholder, otherText, emptyText, items, value, onChoose, onPreview, onOpen }) {
  const uid = host.id;
  host.className = "picker";
  host.innerHTML = `
    <button type="button" class="pickbtn" id="${uid}-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="${labelId} ${uid}-btn">
      <span class="pn"></span><span class="pt"></span>${ICON.chevron}
    </button>
    <div class="pop" hidden>
      <input type="search" class="pop-search" placeholder="${placeholder}" autocomplete="off" spellcheck="false"
             role="combobox" aria-expanded="true" aria-controls="${uid}-list" aria-autocomplete="list">
      <ul class="pop-list" id="${uid}-list" role="listbox" aria-labelledby="${labelId}"></ul>
      <div class="pop-other"><input type="text" class="input" placeholder="${otherText}" autocomplete="off" spellcheck="false"></div>
    </div>`;
  const btn = host.querySelector(".pickbtn"), pop = host.querySelector(".pop");
  const search = host.querySelector(".pop-search"), list = host.querySelector(".pop-list");
  const other = host.querySelector(".pop-other input");
  let shown = [], active = 0;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();

  function refresh() {
    const v = value(), known = items().find((it) => same(it.id, v));
    btn.querySelector(".pn").textContent = known ? known.name : v || "Choose…";
    btn.querySelector(".pt").textContent = known ? known.tag : v ? "Custom" : "";
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    shown = items().filter((it) => !q || [it.id, it.name, it.tag].some((x) => x.toLowerCase().includes(q)));
    list.replaceChildren();
    if (!shown.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = items().length ? "No match. Type your own below." : emptyText;
      list.append(li);
      return;
    }
    shown.forEach((it, i) => {
      const li = document.createElement("li");
      li.id = `${uid}-opt-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(same(it.id, value())));
      li.innerHTML = '<span class="vn"></span><span class="vt"></span>';
      li.querySelector(".vn").textContent = it.name;
      li.querySelector(".vt").textContent = it.tag;
      if (onPreview) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "vp";
        b.innerHTML = ICON.play + "<span>Preview</span>";
        b.setAttribute("aria-label", "Preview " + it.name);
        b.onclick = (e) => { e.stopPropagation(); onPreview(it); };
        li.append(b);
      }
      li.onmousedown = (e) => e.preventDefault();
      li.onclick = () => choose(it.id);
      li.onmousemove = () => setActive(i, false);
      list.append(li);
    });
    const sel = shown.findIndex((it) => same(it.id, value()));
    setActive(sel >= 0 ? sel : 0, true);
  }

  function setActive(i, scroll) {
    active = Math.max(0, Math.min(shown.length - 1, i));
    [...list.children].forEach((li, n) => li.classList.toggle("active", n === active));
    const li = list.children[active];
    if (li && shown.length) {
      search.setAttribute("aria-activedescendant", li.id);
      if (scroll) li.scrollIntoView({ block: "nearest" });
    }
  }

  function open() {
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    search.value = other.value = "";
    render();
    search.focus();
    if (onOpen) onOpen().then(() => { if (!pop.hidden) render(); });
  }

  function close(focusButton) {
    if (pop.hidden) return;
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (focusButton) btn.focus();
  }

  function choose(id) {
    id = (id || "").trim();
    if (!id) return;
    onChoose(id);
    refresh();
    close(true);
  }

  btn.onclick = () => (pop.hidden ? open() : close(false));
  btn.onkeydown = (e) => { if (e.key === "ArrowDown") { e.preventDefault(); open(); } };
  search.oninput = render;
  search.onkeydown = (e) => {
    const keys = {
      ArrowDown: () => setActive(active + 1, true),
      ArrowUp: () => setActive(active - 1, true),
      Home: () => setActive(0, true),
      End: () => setActive(shown.length - 1, true),
      Enter: () => shown[active] && choose(shown[active].id),
      Escape: () => close(true)
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  };
  other.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); choose(other.value); }
    if (e.key === "Escape") { e.preventDefault(); close(true); }
  };
  document.addEventListener("mousedown", (e) => { if (!host.contains(e.target)) close(false); });

  return { refresh, close };
}

/* ---------- live voice lists ---------- */

async function loadLiveVoices() {
  const key = current, p = PRESETS[key], base = (profile.baseUrl || "").replace(/\/+$/, "");
  try {
    if (p.kind === "elevenlabs") {
      if (!profile.apiKey) return;
      const r = await fetch(base + "/voices", { headers: { "xi-api-key": profile.apiKey } });
      if (!r.ok) return;
      const found = ((await r.json()).voices || []).filter((v) => v.voice_id && v.name).map((v) => ({
        name: v.name, id: v.voice_id,
        tag: Object.values(v.labels || {}).slice(0, 3).join(", ") || v.category || ""
      }));
      if (found.length) live[key] = found;
    } else if (p.noKey) {
      const r = await fetch(base + "/audio/voices");
      if (!r.ok) return;
      const names = ((await r.json()).voices || []).map((v) => (typeof v === "string" ? v : v.name || v.id)).filter(Boolean);
      if (names.length) live[key] = names.map((name) => ({ name, tag: (p.voices.find((x) => x.name === name) || {}).tag || "" }));
    }
  } catch (e) { /* offline, bad key or server not running: keep the built-in list */ }
}

/* ---------- form ---------- */

let modelPicker, voicePicker;

function renderProviders() {
  const box = $("providers");
  box.replaceChildren();
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "provider";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(id === current));
    b.tabIndex = id === current ? 0 : -1;
    b.innerHTML = '<b><span></span><i class="check"></i></b><span></span>';
    b.querySelector("b span").textContent = p.label;
    b.lastChild.textContent = p.desc || "";
    b.onclick = () => chooseProvider(id);
    b.onkeydown = (e) => {
      const ids = Object.keys(PRESETS), step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const nextId = ids[(ids.indexOf(id) + step + ids.length) % ids.length];
      chooseProvider(nextId);
      box.querySelector('[aria-checked="true"]').focus();
    };
    box.append(b);
  }
}

function chooseProvider(id) {
  if (id === current) return;
  store.profiles[current] = Object.fromEntries(FIELDS.map((f) => [f, profile[f]]));
  current = id;
  profile = profileFor(store, current);
  modelPicker.close();
  voicePicker.close();
  fillForm();
  save(0);
}

function fillForm() {
  const p = preset();
  renderProviders();
  $("apiKey").value = profile.apiKey || "";
  $("keyField").hidden = !!p.noKey;
  $("localHint").hidden = !p.noKey;
  const hint = $("keyHint");
  if (p.keyUrl) {
    hint.innerHTML = 'Get a key at <a target="_blank" rel="noreferrer"></a>.';
    hint.querySelector("a").href = p.keyUrl;
    hint.querySelector("a").textContent = new URL(p.keyUrl).host;
  } else {
    hint.textContent = "Use the key from your provider, if it needs one.";
  }
  $("baseUrl").value = profile.baseUrl || "";
  $("format").value = profile.format || "";
  $("maxChars").value = profile.maxChars || "";
  $("formatField").hidden = p.kind === "gemini";
  modelPicker.refresh();
  voicePicker.refresh();
  checkAccess();
}

function showSpeed(v) {
  $("speed").value = v;
  $("speedOut").textContent = Number(v).toFixed(2) + "×";
  $("speed").style.setProperty("--fill", ((v - 0.5) / 1.5) * 100 + "%");
}

function showStatus(st) {
  const state = (st && st.state) || "idle";
  running = state === "loading" || state === "playing" || state === "paused";
  $("app").dataset.state = state;
  $("stateText").textContent = { idle: "Ready", loading: "Preparing…", playing: "Reading", paused: "Paused", error: "Error" }[state] || "Ready";
  $("errorBanner").hidden = state !== "error";
  $("errorText").textContent = state === "error" ? st.message : "";
  $("test").innerHTML = running ? ICON.stop + "<span>Stop</span>" : ICON.play + "<span>Play test</span>";
}

function showShortcuts() {
  const list = $("shortcutList");
  chrome.commands.getAll().then((cmds) => {
    list.replaceChildren();
    const label = { "read-selection": "Read", "pause-resume": "Pause", "stop-reading": "Stop", "previous-sentence": "Back", "next-sentence": "Skip" };
    for (const c of cmds) {
      if (!label[c.name]) continue;
      const span = document.createElement("span");
      if (c.shortcut) {
        for (const k of c.shortcut.split("+")) {
          const kbd = document.createElement("kbd");
          kbd.textContent = k;
          span.append(kbd);
        }
        span.append(" " + label[c.name]);
      } else {
        span.textContent = label[c.name] + ": not set";
      }
      list.append(span);
    }
  });
}

// Plays text with the settings on screen (saved first, so the background uses them).
async function speakSample(text, voice) {
  const access = requestHostAccess(); // must start during the click
  await saveNow();
  if (!(await access)) return checkAccess();
  const p = preset();
  const override = voice ? { ...profile, voice, kind: p.kind, noKey: p.noKey } : null;
  chrome.runtime.sendMessage({ target: "background", type: "read", text, override });
}

/* ---------- start ---------- */

(async () => {
  store = await loadStore();
  current = store.provider in PRESETS ? store.provider : "groq";
  profile = profileFor(store, current);

  modelPicker = createPicker($("modelPicker"), {
    labelId: "modelLabel", placeholder: "Search models", otherText: "Other model ID, then press Enter",
    emptyText: "Type the model ID below.",
    items: models, value: () => profile.model || "",
    onChoose: (id) => { profile.model = id; save(); }
  });
  voicePicker = createPicker($("voicePicker"), {
    labelId: "voiceLabel", placeholder: "Search voices", otherText: "Other voice name or ID, then press Enter",
    emptyText: "Type the voice name below.",
    items: voices, value: () => profile.voice || "",
    onChoose: (id) => { profile.voice = id; save(); },
    onPreview: (v) => speakSample(`Hi, I'm ${v.name}. This is how I sound.`, v.id),
    onOpen: loadLiveVoices
  });

  fillForm();
  showSpeed(store.speed);
  $("underline").checked = store.underline;
  $("follow").checked = store.follow;
  $("follow").disabled = !store.underline;
  showShortcuts();

  chrome.storage.local.get({ lastStatus: null }).then((s) => showStatus(s.lastStatus));
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local") return;
    if (c.lastStatus) showStatus(c.lastStatus.newValue);
    if (c.speed && Number(c.speed.newValue) !== store.speed) { store.speed = Number(c.speed.newValue); showSpeed(store.speed); }
    if (c.underline) { store.underline = c.underline.newValue; $("underline").checked = store.underline; $("follow").disabled = !store.underline; }
  });

  $("apiKey").oninput = () => { profile.apiKey = $("apiKey").value.trim(); delete live[current]; save(); };
  $("baseUrl").oninput = () => { profile.baseUrl = $("baseUrl").value.trim(); delete live[current]; save(); };
  $("baseUrl").onchange = checkAccess;
  $("format").oninput = () => { profile.format = $("format").value.trim(); save(); };
  $("maxChars").oninput = () => { profile.maxChars = Number($("maxChars").value) || preset().maxChars; save(); };
  $("reveal").onclick = () => {
    const show = $("apiKey").type === "password";
    $("apiKey").type = show ? "text" : "password";
    $("reveal").textContent = show ? "Hide" : "Show";
  };
  $("speed").oninput = () => showSpeed($("speed").value);
  $("speed").onchange = () => { store.speed = Number($("speed").value); save(0); };
  $("underline").onchange = () => { store.underline = $("underline").checked; $("follow").disabled = !store.underline; save(0); };
  $("follow").onchange = () => { store.follow = $("follow").checked; save(0); };
  $("accessBtn").onclick = async () => { await requestHostAccess(); checkAccess(); };
  $("shortcutsBtn").onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  $("test").onclick = () => {
    if (running) return chrome.runtime.sendMessage({ target: "background", type: "stop" });
    speakSample("Hello! This is a test of your text to speech setup.");
  };
})();
