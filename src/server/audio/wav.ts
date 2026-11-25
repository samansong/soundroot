// WAV encode/decode + waveform peaks. Production uses an FFmpeg worker for MP3/FLAC/etc.

export interface Pcm {
  sampleRate: number;
  channels: Float32Array[];
}

export function encodeWav(pcm: Pcm): Uint8Array {
  const nCh = pcm.channels.length;
  const len = pcm.channels[0].length;
  const bytes = 44 + len * nCh * 2;
  const buf = Buffer.alloc(bytes);
  buf.write("RIFF", 0, "latin1");
  buf.writeUInt32LE(bytes - 8, 4);
  buf.write("WAVE", 8, "latin1");
  buf.write("fmt ", 12, "latin1");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(nCh, 22);
  buf.writeUInt32LE(pcm.sampleRate, 24);
  buf.writeUInt32LE(pcm.sampleRate * nCh * 2, 28);
  buf.writeUInt16LE(nCh * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "latin1");
  buf.writeUInt32LE(len * nCh * 2, 40);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nCh; c++) {
      const s = Math.max(-1, Math.min(1, pcm.channels[c][i]));
      buf.writeInt16LE(Math.round(s * 32767), o);
      o += 2;
    }
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function decodeWav(data: Uint8Array): Pcm {
  const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WAVE") throw new Error("Not a WAV file");
  let off = 12;
  let fmt: { format: number; ch: number; rate: number; bits: number } | null = null;
  while (off + 8 <= b.length) {
    const id = b.toString("latin1", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = { format: b.readUInt16LE(body), ch: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
      if (fmt.format === 0xfffe) fmt.format = b.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV missing fmt chunk");
      const bps = fmt.bits / 8;
      const end = Math.min(b.length, body + size);
      const frames = Math.floor((end - body) / (bps * fmt.ch));
      const channels = Array.from({ length: fmt.ch }, () => new Float32Array(frames));
      let p = body;
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < fmt.ch; c++) {
          let v: number;
          if (fmt.format === 3 && fmt.bits === 32) v = b.readFloatLE(p);
          else if (fmt.bits === 16) v = b.readInt16LE(p) / 32768;
          else if (fmt.bits === 24) v = b.readIntLE(p, 3) / 8388608;
          else if (fmt.bits === 32) v = b.readInt32LE(p) / 2147483648;
          else if (fmt.bits === 8) v = (b[p] - 128) / 128;
          else throw new Error(`Unsupported WAV bit depth ${fmt.bits}`);
          channels[c][i] = v;
          p += bps;
        }
      }
      return { sampleRate: fmt.rate, channels };
    }
    off = body + size + (size % 2);
  }
  throw new Error("WAV missing data chunk");
}

export function peaks(pcm: Pcm, bars = 180): number[] {
  const len = pcm.channels[0].length;
  const step = Math.max(1, Math.floor(len / bars));
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i * step; j < Math.min(len, (i + 1) * step); j += 4) {
      for (const ch of pcm.channels) sum += ch[j] * ch[j];
      n += pcm.channels.length;
    }
    const rms = n ? Math.sqrt(sum / n) : 0;
    out.push(rms);
    if (rms > max) max = rms;
  }
  return out.map((v) => Math.round((max ? v / max : 0) * 100) / 100);
}

export function durationMs(pcm: Pcm) {
  return Math.round((pcm.channels[0].length / pcm.sampleRate) * 1000);
}

/**
 * Preview transcode: mono, lower sample rate, capped length, fades and an audible
 * "SoundzRoot" chime tag every ~9s. Tagged previews deter casual ripping, but browser
 * playback can never fully prevent copying (spec §13).
 */
export function makePreview(pcm: Pcm, opts: { maxSeconds?: number; tag?: boolean } = {}): Pcm {
  const outRate = 22050;
  const maxSec = opts.maxSeconds ?? 30;
  const ratio = pcm.sampleRate / outRate;
  const outLen = Math.min(Math.floor(pcm.channels[0].length / ratio), outRate * maxSec);
  const mono = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = Math.floor(i * ratio);
    let s = 0;
    for (const ch of pcm.channels) s += ch[src] ?? 0;
    mono[i] = s / pcm.channels.length;
  }
  const fade = Math.floor(outRate * 1.5);
  for (let i = 0; i < fade && i < outLen; i++) mono[outLen - 1 - i] *= i / fade;
  if (opts.tag !== false) {
    const notes = [1318.5, 1567.98, 2093];
    for (let t = 4; t < outLen / outRate - 1; t += 9) {
      notes.forEach((f, k) => {
        const start = Math.floor((t + k * 0.09) * outRate);
        const dur = Math.floor(0.5 * outRate);
        for (let i = 0; i < dur && start + i < outLen; i++) {
          const env = Math.exp(-i / (outRate * 0.12));
          mono[start + i] += 0.12 * env * Math.sin((2 * Math.PI * f * i) / outRate);
        }
      });
    }
  }
  return { sampleRate: outRate, channels: [mono] };
}
