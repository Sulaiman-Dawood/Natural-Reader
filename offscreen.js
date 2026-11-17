let session = 0;
let abortCtl = null;
let currentAudio = null;
let currentResolve = null;
let speed = 1;
let paused = false;
// The reading in progress: the whole text, its settings, every sentence, and which one is playing.
let current = null;

const send = (msg) => chrome.runtime.sendMessage({ target: "background", ...msg }).catch(() => {});
const status = (state, message) => send({ type: "status", state, message });

/* ---------- text into chunks ---------- */

// Intl.Segmenter keeps "3.14", "e.g." and "example.com" whole and understands 。！？.
const sentenceSplitter = new Intl.Segmenter(undefined, { granularity: "sentence" });
const FIRST_CHUNK_CHARS = 150;

// Splits text into chunks of whole sentences for the voice service. The first chunk is short so
// audio starts quickly; each later chunk may be twice as long, up to `max`. Each chunk lists its
// sentences with their [start, end) position in `text`, so the page can underline them.
function chunkText(text, max) {
  const chunks = [];
  let cur = null;
  const target = () => Math.min(max, FIRST_CHUNK_CHARS * 2 ** chunks.length);
  const push = () => {
    if (cur && cur.text.trim()) chunks.push({ text: cur.text.trim(), sentences: cur.sentences });
    cur = null;
  };
  // `piece` is spoken text; `at` is where it starts in `text`, `lineEnd` where its line ends.
  const add = (piece, at, lineEnd) => {
    if (!cur) cur = { text: "", sentences: [] };
    cur.text += piece;
    const start = at + (piece.length - piece.trimStart().length);
    const end = Math.min(lineEnd, at + piece.trimEnd().length);
    if (end > start) cur.sentences.push({ start, end, text: piece.trim().replace(/\s+/g, " ") });
  };
  for (const m of text.matchAll(/[^\n]+/g)) {
    let line = m[0].trim();
    if (!line) continue;
    const base = m.index + (m[0].length - m[0].trimStart().length), lineEnd = base + line.length;
    if (!/[.!?:;"”')\]。！？]$/.test(line)) line += ".";
    for (const seg of sentenceSplitter.segment(line + " ")) {
      let s = seg.segment, at = base + seg.index;
      while (s.length > max) {
        let cut = s.lastIndexOf(" ", max);
        if (cut < max * 0.5) cut = max;
        push();
        add(s.slice(0, cut), at, lineEnd);
        push();
        s = s.slice(cut);
        at += cut;
      }
      if (cur && (cur.text + s).length > target()) push();
      add(s, at, lineEnd);
    }
  }
  push();
  return chunks;
}

// Which sentence of `chunk` is being spoken `p` (0 to 1) of the way through its audio. Longer
// sentences take longer; the constant stands in for the pause after each one.
function sentenceAt(chunk, p) {
  const weights = chunk.sentences.map((s) => s.text.length + 12);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let k = 0; k < weights.length; k++) {
    acc += weights[k];
    if (p * total < acc) return k;
  }
  return weights.length - 1;
}

/* ---------- audio formats ---------- */

const tagAt = (bytes, p) => String.fromCharCode(...bytes.subarray(p, p + 4));

// A minimal WAV file: the format chunk and the sound, nothing else.
function wavFile(fmt, sound) {
  const pad = fmt.length & 1;
  const head = new Uint8Array(20 + fmt.length + pad + 8);
  const v = new DataView(head.buffer);
  const tag = (o, s) => [...s].forEach((c, i) => (head[o + i] = c.charCodeAt(0)));
  tag(0, "RIFF"); v.setUint32(4, head.length - 8 + sound.byteLength, true); tag(8, "WAVE");
  tag(12, "fmt "); v.setUint32(16, fmt.length, true); head.set(fmt, 20);
  tag(20 + fmt.length + pad, "data"); v.setUint32(24 + fmt.length + pad, sound.byteLength, true);
  return new Blob([head, sound], { type: "audio/wav" });
}

// The format chunk for 16-bit PCM.
function pcmFormat(channels, rate) {
  const v = new DataView(new ArrayBuffer(16));
  v.setUint16(0, 1, true); v.setUint16(2, channels, true); v.setUint32(4, rate, true);
  v.setUint32(8, rate * channels * 2, true); v.setUint16(12, channels * 2, true); v.setUint16(14, 16, true);
  return new Uint8Array(v.buffer);
}

// Keeps only the sound of a WAV file and drops every other chunk, such as the C2PA
// "content credentials" signature newer Gemini models put after the audio.
function wavSoundOnly(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt = null;
  for (let p = 12; p + 8 <= bytes.length; ) {
    const id = tagAt(bytes, p);
    let size = v.getUint32(p + 4, true);
    if (id === "fmt ") fmt = bytes.subarray(p + 8, p + 8 + size);
    else if (id === "data" && fmt) {
      // Streaming encoders write 0 or 0xFFFFFFFF here when they don't know the length yet.
      if (!size || p + 8 + size > bytes.length) size = bytes.length - p - 8;
      return wavFile(fmt, bytes.subarray(p + 8, p + 8 + size));
    }
    p += 8 + size + (size & 1);
  }
  return new Blob([bytes], { type: "audio/wav" }); // unusual layout: leave it to the browser's decoder
}

// Gemini sends either bare 16-bit samples ("audio/L16;codec=pcm;rate=24000") or, on newer
// models, a complete WAV file. Treating a WAV file as bare samples plays its header and its
// C2PA signature as sound: a loud burst of noise (the "prr") after the last word of every clip.
function geminiAudio(inline) {
  const bytes = Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0));
  const mime = (inline.mimeType || "").toLowerCase();
  if (bytes.length >= 12 && tagAt(bytes, 0) === "RIFF" && tagAt(bytes, 8) === "WAVE") return wavSoundOnly(bytes);
  if (!mime || /l16|pcm/.test(mime)) {
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
    return wavFile(pcmFormat(1, rate), bytes);
  }
  return new Blob([bytes], { type: mime }); // e.g. mp3 or ogg: the browser decodes these itself
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); };
    const t = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

// Wait time before a retry: the server's Retry-After header, Gemini's retryDelay, or
// exponential backoff. Capped so a retry never leaves the player silent for long.
function retryWait(r, body, attempt) {
  const header = r.headers.get("retry-after");
  let sec = Number(header);
  if (!sec && header) sec = (Date.parse(header) - Date.now()) / 1000;
  if (!(sec > 0)) sec = Number(/"retryDelay"\s*:\s*"([\d.]+)s"/.exec(body)?.[1]);
  const ms = sec > 0 ? sec * 1000 : 1000 * 2 ** attempt;
  return Math.min(ms, 20000) + Math.random() * 250;
}

// fetch() that retries rate limits and server hiccups, and throws "<status> <body>" otherwise.
async function request(url, init, signal) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { ...init, signal });
    if (r.ok) return r;
    const body = await r.text();
    const retry = attempt < MAX_RETRIES && RETRYABLE.has(r.status) && !/insufficient_quota/.test(body);
    if (!retry) throw new Error(r.status + " " + body.slice(0, 400));
    await sleep(retryWait(r, body, attempt), signal);
  }
}

async function fetchGemini(s, input, signal) {
  const model = s.model.replace(/^models\//, "");
  const url = s.baseUrl.replace(/\/+$/, "") + "/models/" + model + ":generateContent";
  const r = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": s.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: input }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } } }
      }
    })
  }, signal);
  const data = await r.json();
  const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) {
    const why = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || "no audio in response";
    throw new Error("Gemini returned no audio (" + why + ").");
  }
  return geminiAudio(part.inlineData);
}

async function fetchElevenLabs(s, input, signal) {
  const url = s.baseUrl.replace(/\/+$/, "") + "/text-to-speech/" + encodeURIComponent(s.voice) +
    "?output_format=" + encodeURIComponent(s.format || "mp3_44100_128");
  const r = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": s.apiKey },
    body: JSON.stringify({ text: input, model_id: s.model })
  }, signal);
  return r.blob();
}

let decoderCtx = null;

// Trims trailing silence, so chunks follow each other without long gaps, and fades the edges
// to avoid clicks.
function processBuffer(buf) {
  const sr = buf.sampleRate, nch = buf.numberOfChannels;
  const data = [];
  for (let c = 0; c < nch; c++) data.push(buf.getChannelData(c));
  let peak = 0;
  for (const d of data) for (let i = 0; i < d.length; i += 4) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const thr = Math.max(0.004, peak * 0.02);
  const win = Math.max(1, Math.round(sr * 0.005));
  let end = buf.length;
  while (end > win * 4) {
    let sum = 0;
    for (const d of data) for (let i = end - win; i < end; i++) sum += d[i] * d[i];
    if (Math.sqrt(sum / (win * nch)) > thr) break;
    end -= win;
  }
  end = Math.min(buf.length, end + Math.round(sr * 0.04));
  const fadeIn = Math.min(end, Math.round(sr * 0.006));
  const fadeOut = Math.min(end, Math.round(sr * 0.05));
  const total = end + Math.round(sr * 0.08);
  const out = data.map((d) => {
    const o = new Float32Array(total);
    o.set(d.subarray(0, end));
    for (let i = 0; i < fadeIn; i++) o[i] *= i / fadeIn;
    for (let i = 0; i < fadeOut; i++) o[end - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeOut);
    return o;
  });
  return { channels: out, sampleRate: sr };
}

function encodeWav({ channels, sampleRate }) {
  const nch = channels.length, len = channels[0].length;
  const pcm = new Int16Array(len * nch);
  for (let i = 0; i < len; i++)
    for (let c = 0; c < nch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      pcm[i * nch + c] = v < 0 ? v * 32768 : v * 32767;
    }
  return wavFile(pcmFormat(nch, sampleRate), new Uint8Array(pcm.buffer));
}

async function cleanBlob(blob) {
  try {
    decoderCtx = decoderCtx || new OfflineAudioContext(1, 1, 48000);
    const buf = await decoderCtx.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(processBuffer(buf));
  } catch (e) {
    return blob;
  }
}

/* ---------- playback ---------- */

function stop() {
  session++;
  if (abortCtl) abortCtl.abort();
  if (currentAudio) currentAudio.pause();
  if (currentResolve) currentResolve();
  currentAudio = currentResolve = abortCtl = null;
}

// Plays one chunk. `onProgress` gets how far through it is, from 0 to 1.
function play(blob, onProgress) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.playbackRate = speed;
    currentAudio = a;
    currentResolve = () => {
      if (currentAudio === a) currentAudio = null; // so "resume" never replays a finished chunk
      URL.revokeObjectURL(url);
      resolve();
    };
    a.ontimeupdate = () => { if (a.duration) onProgress(a.currentTime / a.duration); };
    a.onended = () => currentResolve && currentResolve();
    a.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The audio could not be played. Try another audio format under Advanced.")); };
    if (!paused) a.play().then(() => status("playing")).catch(reject); // when paused, "resume" starts it
  });
}

// Tracks whether a promise has settled, without waiting for it.
function tracked(promise) {
  const t = { promise, settled: false };
  promise.then(() => (t.settled = true), () => (t.settled = true));
  return t;
}

// Reads `text` starting at the sentence that contains position `from`.
async function speak(text, s, from = 0) {
  stop();
  paused = false;
  const id = session;
  const ctl = (abortCtl = new AbortController());
  const url = s.baseUrl.replace(/\/+$/, "") + "/audio/speech";
  speed = Number(s.speed) || 1;

  const fetchChunk = async (chunk) => {
    const input = chunk.text.replace(/\s+/g, " ");
    if (s.kind === "gemini") return fetchGemini(s, input, ctl.signal);
    if (s.kind === "elevenlabs") return fetchElevenLabs(s, input, ctl.signal);
    const r = await request(url, {
      method: "POST",
      headers: s.apiKey
        ? { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey }
        : { "Content-Type": "application/json" },
      body: JSON.stringify({ model: s.model, input, voice: s.voice, response_format: s.format })
    }, ctl.signal);
    return r.blob();
  };

  // Positions stay relative to the whole text, so the underline and skipping keep working.
  const all = chunkText(text, Infinity).flatMap((c) => c.sentences);
  const first = all.findIndex((x) => x.end > from);
  if (first < 0) { current = null; return status("idle"); }
  const startAt = all[first].start;
  current = { text, s, all, index: first };
  const chunks = chunkText(text.slice(startAt), Number(s.maxChars) || 200).map((c) => ({
    text: c.text,
    sentences: c.sentences.map((x) => ({ ...x, start: x.start + startAt, end: x.end + startAt }))
  }));
  if (!chunks.length) return status("idle");
  try {
    let next = tracked(fetchChunk(chunks[0]));
    for (let i = 0; i < chunks.length; i++) {
      if (!next.settled && !paused) status("loading"); // only while actually waiting for the voice service
      const blob = await next.promise;
      if (id !== session) return;
      if (i + 1 < chunks.length) {
        next = tracked(fetchChunk(chunks[i + 1]));
        next.promise.catch(() => {});
      }
      const audio = await cleanBlob(blob);
      if (id !== session) return;
      const chunk = chunks[i];
      let shown = -1;
      const onProgress = (p) => {
        const k = sentenceAt(chunk, p);
        const sentence = chunk.sentences[k];
        if (k === shown || !sentence || id !== session) return;
        shown = k;
        const index = all.findIndex((x) => x.start === sentence.start);
        if (index >= 0) current.index = index;
        send({ type: "progress", start: sentence.start, end: sentence.end, text: sentence.text, index, total: all.length });
      };
      onProgress(0);
      await play(audio, onProgress);
      if (id !== session) return;
    }
    current = null;
    status("idle");
  } catch (e) {
    if (e.name === "AbortError" || id !== session) return;
    status("error", e.message);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "speak") speak(msg.text, msg.settings, msg.from || 0);
  if (msg.type === "stop") { stop(); current = null; }
  if (msg.type === "pause" && current) {
    paused = true;
    if (currentAudio) currentAudio.pause();
    status("paused");
  }
  if (msg.type === "resume" && current) {
    paused = false;
    if (currentAudio) currentAudio.play().then(() => status("playing")).catch(() => {});
    else status("loading"); // the next chunk is still on its way and starts by itself
  }
  if (msg.type === "seek" && current) seekTo(current.index + msg.delta);
  if (msg.type === "seek-pos" && current) seekTo(Math.max(0, current.all.findLastIndex((x) => x.start <= msg.pos)));
  if (msg.type === "speed") {
    speed = Number(msg.speed) || 1;
    if (currentAudio) currentAudio.playbackRate = speed;
  }
  // `active` tells the background whether a reading is still loaded here. Chrome closes this page
  // after about 30 seconds without sound, so a long pause loses it and the background restarts.
  sendResponse({ ok: true, active: !!current });
});

// Restarts reading at sentence `index` (clamped to the text).
function seekTo(index) {
  const i = Math.max(0, Math.min(current.all.length - 1, index));
  speak(current.text, current.s, current.all[i].start);
}
