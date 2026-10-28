const GEMINI_VOICES = [
  ["Zephyr","Bright"],["Puck","Upbeat"],["Charon","Informative"],["Kore","Firm"],["Fenrir","Excitable"],
  ["Leda","Youthful"],["Orus","Firm"],["Aoede","Breezy"],["Callirrhoe","Easy-going"],["Autonoe","Bright"],
  ["Enceladus","Breathy"],["Iapetus","Clear"],["Umbriel","Easy-going"],["Algieba","Smooth"],["Despina","Smooth"],
  ["Erinome","Clear"],["Algenib","Gravelly"],["Rasalgethi","Informative"],["Laomedeia","Upbeat"],["Achernar","Soft"],
  ["Alnilam","Firm"],["Schedar","Even"],["Gacrux","Mature"],["Pulcherrima","Forward"],["Achird","Friendly"],
  ["Zubenelgenubi","Casual"],["Vindemiatrix","Gentle"],["Sadachbia","Lively"],["Sadaltager","Knowledgeable"],["Sulafat","Warm"]
].map(([name, tag]) => ({ name, tag }));

const PRESETS = {
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "canopylabs/orpheus-v1-english",
    voice: "hannah",
    format: "wav",
    maxChars: 200,
    trimEnd: 0,
    voices: [
      { name: "autumn", tag: "Female" }, { name: "diana", tag: "Female" }, { name: "hannah", tag: "Female" },
      { name: "austin", tag: "Male" }, { name: "daniel", tag: "Male" }, { name: "troy", tag: "Male" }
    ],
    keyUrl: "https://console.groq.com/keys"
  },
  gemini: {
    label: "Gemini",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.1-flash-tts-preview",
    voice: "Kore",
    format: "wav",
    maxChars: 1000,
    trimEnd: 0,
    voices: GEMINI_VOICES,
    keyUrl: "https://aistudio.google.com/apikey"
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemini-3.1-flash-tts-preview",
    voice: "Orus",
    format: "mp3",
    maxChars: 800,
    trimEnd: 0,
    voices: GEMINI_VOICES,
    keyUrl: "https://openrouter.ai/settings/keys"
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    format: "mp3",
    maxChars: 3000,
    trimEnd: 0,
    voices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"].map((name) => ({ name, tag: "" })),
    keyUrl: "https://platform.openai.com/api-keys"
  },
  custom: {
    label: "Custom",
    baseUrl: "",
    model: "",
    voice: "",
    format: "mp3",
    maxChars: 1000,
    trimEnd: 0,
    voices: [],
    keyUrl: ""
  }
};

async function loadStore() {
  return chrome.storage.local.get({ provider: "groq", speed: 1, profiles: {} });
}

function profileFor(store, provider) {
  return { apiKey: "", ...PRESETS[provider], ...(store.profiles[provider] || {}) };
}

async function loadSettings() {
  const s = await loadStore();
  return { provider: s.provider, speed: s.speed, ...profileFor(s, s.provider) };
}
