const GEMINI_VOICES = [
  ["Zephyr","Bright"],["Puck","Upbeat"],["Charon","Informative"],["Kore","Firm"],["Fenrir","Excitable"],
  ["Leda","Youthful"],["Orus","Firm"],["Aoede","Breezy"],["Callirrhoe","Easy-going"],["Autonoe","Bright"],
  ["Enceladus","Breathy"],["Iapetus","Clear"],["Umbriel","Easy-going"],["Algieba","Smooth"],["Despina","Smooth"],
  ["Erinome","Clear"],["Algenib","Gravelly"],["Rasalgethi","Informative"],["Laomedeia","Upbeat"],["Achernar","Soft"],
  ["Alnilam","Firm"],["Schedar","Even"],["Gacrux","Mature"],["Pulcherrima","Forward"],["Achird","Friendly"],
  ["Zubenelgenubi","Casual"],["Vindemiatrix","Gentle"],["Sadachbia","Lively"],["Sadaltager","Knowledgeable"],["Sulafat","Warm"]
].map(([name, tag]) => ({ name, tag }));

const ELEVENLABS_VOICES = [
  ["Rachel","21m00Tcm4TlvDq8ikWAM","American female, calm"],["Sarah","EXAVITQu4vr4xnSDxMaL","American female, soft"],
  ["Jessica","cgSgspJ2msm6clMCkdW9","American female, expressive"],["Alice","Xb7hH8MSUJpSbSDYk0k2","British female, confident"],
  ["Matilda","XrExE9yKIg1WjnnlVkGX","American female, friendly"],["Lily","pFZP5JQG7iQjIQuC4Bku","British female, warm"],
  ["Charlotte","XB0fDUnXU5powFXDhCwa","Swedish female, seductive"],["Domi","AZnzlk1XvdvUeBnXmlld","American female, strong"],
  ["Adam","pNInz6obpgDQGcFmaJgB","American male, deep"],["Brian","nPczCjzI2devNBz1zQrb","American male, deep"],
  ["George","JBFqnCBsd6RMkjVDRZzb","British male, warm"],["Daniel","onwK4e9ZLuTAKqWW03F9","British male, authoritative"],
  ["Josh","TxGEqnHWrfWFTfGW9XjX","American male, deep"],["Liam","TX3LPaxmHKxFdv7VOQHJ","American male, articulate"],
  ["Charlie","IKne3meq5aSn9XLyUdCD","Australian male, casual"],["Callum","N2lVS1w4EtoT3dr4eOWO","American male, hoarse"],
  ["Bill","pqHfZKP75CvOlQylNhV4","American male, trustworthy"],["Antoni","ErXwobaYiN019PkySvjV","American male, well-rounded"]
].map(([name, id, tag]) => ({ name, id, tag }));

const PRESETS = {
  groq: {
    label: "Groq",
    desc: "Very fast",
    models: [
      { id: "canopylabs/orpheus-v1-english", name: "Orpheus English", tag: "Expressive English voices" }
    ],
    baseUrl: "https://api.groq.com/openai/v1",

    model: "canopylabs/orpheus-v1-english",
    voice: "hannah",
    format: "wav",
    maxChars: 200,
    voices: [
      { name: "autumn", tag: "Female" }, { name: "diana", tag: "Female" }, { name: "hannah", tag: "Female" },
      { name: "austin", tag: "Male" }, { name: "daniel", tag: "Male" }, { name: "troy", tag: "Male" }
    ],
    keyUrl: "https://console.groq.com/keys"
  },
  gemini: {
    label: "Gemini",
    desc: "30 voices",
    models: [
      { id: "gemini-3.1-flash-tts-preview", name: "Gemini 3.1 Flash TTS", tag: "Newest, fast and natural" },
      { id: "gemini-2.5-flash-preview-tts", name: "Gemini 2.5 Flash TTS", tag: "Fast and low cost" },
      { id: "gemini-2.5-pro-preview-tts", name: "Gemini 2.5 Pro TTS", tag: "Highest quality" }
    ],
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",

    model: "gemini-3.1-flash-tts-preview",
    voice: "Kore",
    format: "wav",
    maxChars: 1000,
    voices: GEMINI_VOICES,
    keyUrl: "https://aistudio.google.com/apikey"
  },
  openrouter: {
    label: "OpenRouter",
    desc: "One key, many models",
    models: [
      { id: "google/gemini-3.1-flash-tts-preview", name: "Gemini 3.1 Flash TTS", tag: "Gemini voices via OpenRouter" }
    ],
    baseUrl: "https://openrouter.ai/api/v1",

    model: "google/gemini-3.1-flash-tts-preview",
    voice: "Orus",
    format: "mp3",
    maxChars: 800,
    voices: GEMINI_VOICES,
    keyUrl: "https://openrouter.ai/settings/keys"
  },
  openai: {
    label: "OpenAI",
    desc: "Natural and steerable",
    models: [
      { id: "gpt-4o-mini-tts", name: "GPT-4o mini TTS", tag: "Most natural, newest" },
      { id: "tts-1-hd", name: "TTS-1 HD", tag: "Higher quality, slower" },
      { id: "tts-1", name: "TTS-1", tag: "Fastest and cheapest" }
    ],
    baseUrl: "https://api.openai.com/v1",

    model: "gpt-4o-mini-tts",
    voice: "alloy",
    format: "mp3",
    maxChars: 3000,
    voices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"].map((name) => ({ name, tag: "" })),
    keyUrl: "https://platform.openai.com/api-keys"
  },
  elevenlabs: {
    label: "ElevenLabs",
    desc: "Lifelike voices",
    models: [
      { id: "eleven_multilingual_v2", name: "Multilingual v2", tag: "Most stable, 29 languages" },
      { id: "eleven_v3", name: "Eleven v3", tag: "Most expressive, newest" },
      { id: "eleven_flash_v2_5", name: "Flash v2.5", tag: "Ultra fast, low cost" },
      { id: "eleven_turbo_v2_5", name: "Turbo v2.5", tag: "Balanced speed and quality" }
    ],
    kind: "elevenlabs",
    baseUrl: "https://api.elevenlabs.io/v1",

    model: "eleven_multilingual_v2",
    voice: "21m00Tcm4TlvDq8ikWAM",
    format: "mp3_44100_128",
    maxChars: 2500,
    voices: ELEVENLABS_VOICES,
    keyUrl: "https://elevenlabs.io/app/settings/api-keys"
  },
  local: {
    label: "Local",
    desc: "Private, no key",
    models: [
      { id: "kokoro", name: "Kokoro", tag: "Runs on your computer" }
    ],
    noKey: true,
    baseUrl: "http://localhost:8880/v1",

    model: "kokoro",
    voice: "af_heart",
    format: "mp3",
    maxChars: 1000,
    voices: [
      { name: "af_heart", tag: "American female" }, { name: "af_bella", tag: "American female" },
      { name: "af_nicole", tag: "American female" }, { name: "af_sarah", tag: "American female" },
      { name: "af_sky", tag: "American female" }, { name: "am_adam", tag: "American male" },
      { name: "am_michael", tag: "American male" }, { name: "bf_emma", tag: "British female" },
      { name: "bf_isabella", tag: "British female" }, { name: "bm_george", tag: "British male" },
      { name: "bm_lewis", tag: "British male" }
    ],
    keyUrl: ""
  },
  custom: {
    label: "Custom",
    desc: "Any OpenAI-style API",
    baseUrl: "",

    model: "",
    voice: "",
    format: "mp3",
    maxChars: 1000,
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
