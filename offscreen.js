let session = 0;
let abortCtl = null;
let currentAudio = null;
let currentResolve = null;

const status = (state, message) =>
  chrome.runtime.sendMessage({ target: "background", type: "status", state, message });

function chunkText(text, max) {
  const sentences = [];
  for (let line of text.split(/\n+/)) {
    line = line.replace(/[ \t]+/g, " ").trim();
    if (!line) continue;
    if (!/[.!?:;"”')\]]$/.test(line)) line += ".";
    sentences.push(...(line.match(/[^.!?]+[.!?]*["”')\]]*\s*/g) || [line]));
  }
  const chunks = [];
  let cur = "";
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
  for (let s of sentences) {
    s = s.trim() + " ";
    while (s.length > max) {
      let cut = s.lastIndexOf(" ", max);
      if (cut < max * 0.5) cut = max;
      push();
      chunks.push(s.slice(0, cut).trim());
      s = s.slice(cut);
    }
    if ((cur + s).length > max) push();
    cur += s;
  }
  push();
  return chunks.filter(Boolean);
}

function pcmToWav(pcm, rate) {
  const h = new ArrayBuffer(44);
  const v = new DataView(h);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.length, true);
  return new Blob([h, pcm], { type: "audio/wav" });
}

async function fetchGemini(s, input, signal) {
  const model = s.model.replace(/^models\//, "");
  const url = s.baseUrl.replace(/\/+$/, "") + "/models/" + model + ":generateContent";
  const r = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": s.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: input }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } } }
      }
    })
  });
  if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 400));
  const data = await r.json();
  const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) {
    const why = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || "no audio in response";
    throw new Error("Gemini returned no audio (" + why + ").");
  }
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1]) || 24000;
  const pcm = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
  return pcmToWav(pcm, rate);
}

let decoderCtx = null;

function removeTailBurst(data, sr, end, words) {
  if (words < 3) return end;
  const frame = Math.max(1, Math.round(sr * 0.01));
  const nF = Math.floor(end / frame);
  const rms = new Float32Array(nF);
  let pk = 0;
  for (let f = 0; f < nF; f++) {
    let sum = 0;
    for (const d of data) for (let i = f * frame; i < (f + 1) * frame; i++) sum += d[i] * d[i];
    rms[f] = Math.sqrt(sum / (frame * data.length));
    if (rms[f] > pk) pk = rms[f];
  }
  const thr = Math.max(0.003, pk * 0.05);
  const segs = [];
  let s = -1, last = -1, gap = 0;
  for (let f = 0; f < nF; f++) {
    if (rms[f] > thr) { if (s < 0) s = f; last = f; gap = 0; }
    else if (s >= 0 && ++gap >= 5) { segs.push([s, last]); s = -1; gap = 0; }
  }
  if (s >= 0) segs.push([s, last]);
  if (segs.length < 2) return end;
  const [ls, le] = segs[segs.length - 1];
  const pe = segs[segs.length - 2][1];
  const durMs = (le - ls + 1) * 10, gapMs = (ls - pe - 1) * 10;
  return durMs <= 400 && gapMs >= 250 ? (pe + 1) * frame : end;
}

function processBuffer(buf, trimEndMs, words) {
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
  end = removeTailBurst(data, sr, end, words || 0);
  end = Math.min(buf.length, end + Math.round(sr * 0.04));
  end = Math.max(win * 4, end - Math.round(sr * (Number(trimEndMs) || 0) / 1000));
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
  const h = new ArrayBuffer(44), v = new DataView(h);
  const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.byteLength, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nch * 2, true);
  v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.byteLength, true);
  return new Blob([h, pcm.buffer], { type: "audio/wav" });
}

async function cleanBlob(blob, s, words) {
  try {
    decoderCtx = decoderCtx || new OfflineAudioContext(1, 1, 48000);
    const buf = await decoderCtx.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(processBuffer(buf, s.trimEnd, words));
  } catch (e) {
    return blob;
  }
}

function stop() {
  session++;
  if (abortCtl) abortCtl.abort();
  if (currentAudio) currentAudio.pause();
  if (currentResolve) currentResolve();
  currentAudio = currentResolve = abortCtl = null;
}

function play(blob, speed) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.playbackRate = speed;
    currentAudio = a;
    currentResolve = () => { URL.revokeObjectURL(url); resolve(); };
    a.onended = () => currentResolve && currentResolve();
    a.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The audio could not be played. Try another audio format under Advanced.")); };
    a.play().then(() => status("playing")).catch(reject);
  });
}

async function speak(text, s) {
  stop();
  const id = session;
  const ctl = (abortCtl = new AbortController());
  const url = s.baseUrl.replace(/\/+$/, "") + "/audio/speech";

  const fetchChunk = async (input) => {
    if (s.kind === "gemini") return fetchGemini(s, input, ctl.signal);
    const r = await fetch(url, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.apiKey },
      body: JSON.stringify({ model: s.model, input, voice: s.voice, response_format: s.format })
    });
    if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 400));
    return r.blob();
  };

  const chunks = chunkText(text, Number(s.maxChars) || 200);
  try {
    let next = fetchChunk(chunks[0]);
    for (let i = 0; i < chunks.length; i++) {
      const blob = await next;
      if (id !== session) return;
      if (i + 1 < chunks.length) {
        next = fetchChunk(chunks[i + 1]);
        next.catch(() => {});
      }
      status("loading");
      const lastSentence = (chunks[i].match(/[^.!?]+[.!?]*["”')\]]*\s*$/) || [chunks[i]])[0];
      const words = lastSentence.trim().split(/\s+/).length;
      await play(await cleanBlob(blob, s, words), Number(s.speed) || 1);
      if (id !== session) return;
    }
    status("idle");
  } catch (e) {
    if (e.name === "AbortError" || id !== session) return;
    status("error", e.message);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "speak") speak(msg.text, msg.settings);
  if (msg.type === "stop") stop();
  sendResponse({ ok: true });
});
