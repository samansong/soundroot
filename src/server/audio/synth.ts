// Procedural beat renderer used to seed the catalog with real, original audio.
// Pure TypeScript synthesis: drums, log drum, 808, keys, pads, Karplus–Strong guitar, Schroeder reverb.
import type { Pcm } from "./wav.ts";

export type Genre = "Afrobeats" | "Amapiano" | "Gospel" | "Highlife" | "Asakaa Drill" | "Hiplife" | "Afro House" | "Afro Soul";

export interface BeatSpec {
  genre: Genre;
  bpm: number;
  key: string; // e.g. "A minor", "F major"
  seed: number;
  seconds?: number;
}

const SR = 32000;
const TAU = Math.PI * 2;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTE: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Style {
  kick: number[];
  snare: number[];
  clap: number[];
  rim: number[];
  hat: number[];
  openHat: number[];
  shaker: boolean;
  conga: number[];
  bell: number[];
  log: [number, number][]; // [step, scale-degree offset]
  bass: [number, number, number][]; // [step, degree offset, length in steps]
  bassType: "sub" | "808" | "none";
  chordStabs: number[]; // steps where EP chord hits; empty = sustained
  keys: "ep" | "piano" | "pad" | "guitar";
  pad: boolean;
  lead: "pluck" | "bell" | "kalimba" | "none";
  prog: number[];
  sevenths: boolean;
  swing: number;
  halfTime?: boolean;
  hatRolls?: boolean;
}

const STYLES: Record<Genre, Style> = {
  Afrobeats: {
    kick: [0, 6, 8, 14], snare: [], clap: [4, 12], rim: [3, 7, 10, 13], hat: [2, 6, 10, 14], openHat: [],
    shaker: true, conga: [2, 5, 9, 11, 15], bell: [], log: [],
    bass: [[0, 0, 3], [6, 0, 2], [8, 0, 3], [14, 4, 2]], bassType: "sub",
    chordStabs: [0, 3, 6, 10, 12], keys: "ep", pad: true, lead: "pluck",
    prog: [0, 5, 2, 6], sevenths: true, swing: 0.12,
  },
  Amapiano: {
    kick: [0, 4, 8, 12], snare: [], clap: [4, 12], rim: [7, 15], hat: [2, 6, 10, 14], openHat: [],
    shaker: true, conga: [], bell: [],
    log: [[3, 0], [6, 0], [10, -2], [11, 0], [14, 2]], bass: [], bassType: "none",
    chordStabs: [], keys: "piano", pad: true, lead: "kalimba",
    prog: [0, 5, 3, 4], sevenths: true, swing: 0.18,
  },
  Gospel: {
    kick: [0, 7, 10], snare: [4, 12], clap: [], rim: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [14],
    shaker: false, conga: [], bell: [], log: [],
    bass: [[0, 0, 6], [7, 0, 3], [10, 4, 6]], bassType: "sub",
    chordStabs: [], keys: "piano", pad: true, lead: "bell",
    prog: [0, 5, 3, 4], sevenths: true, swing: 0.08,
  },
  Highlife: {
    kick: [0, 8, 11], snare: [4, 12], clap: [], rim: [], hat: [2, 6, 10, 14], openHat: [],
    shaker: true, conga: [3, 6, 7, 14], bell: [0, 3, 6, 8, 10, 13], log: [],
    bass: [[0, 0, 3], [6, 4, 2], [8, 0, 3], [12, 2, 2], [14, 4, 2]], bassType: "sub",
    chordStabs: [], keys: "guitar", pad: false, lead: "pluck",
    prog: [0, 3, 4, 0], sevenths: false, swing: 0.05,
  },
  "Asakaa Drill": {
    kick: [0, 11], snare: [8], clap: [], rim: [], hat: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], openHat: [],
    shaker: false, conga: [], bell: [], log: [],
    bass: [[0, 0, 5], [6, 0, 2], [11, -2, 3], [14, 3, 2]], bassType: "808",
    chordStabs: [], keys: "pad", pad: false, lead: "bell",
    prog: [0, 5, 6, 4], sevenths: false, swing: 0, halfTime: true, hatRolls: true,
  },
  Hiplife: {
    kick: [0, 7, 10], snare: [4, 12], clap: [12], rim: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [6],
    shaker: false, conga: [5, 13], bell: [], log: [],
    bass: [[0, 0, 4], [7, 0, 2], [10, 2, 4]], bassType: "sub",
    chordStabs: [0, 6, 10], keys: "ep", pad: false, lead: "pluck",
    prog: [0, 3, 5, 4], sevenths: true, swing: 0.22,
  },
  "Afro House": {
    kick: [0, 4, 8, 12], snare: [], clap: [4, 12], rim: [], hat: [], openHat: [2, 6, 10, 14],
    shaker: true, conga: [3, 7, 11, 14, 15], bell: [], log: [],
    bass: [[2, 0, 2], [6, 0, 2], [10, 0, 2], [14, 2, 2]], bassType: "sub",
    chordStabs: [], keys: "pad", pad: true, lead: "kalimba",
    prog: [0, 6, 5, 6], sevenths: false, swing: 0.06,
  },
  "Afro Soul": {
    kick: [0, 9], snare: [4, 12], clap: [], rim: [7, 14], hat: [2, 6, 10, 14], openHat: [],
    shaker: true, conga: [3, 11], bell: [], log: [],
    bass: [[0, 0, 6], [9, 2, 5]], bassType: "sub",
    chordStabs: [], keys: "ep", pad: true, lead: "kalimba",
    prog: [0, 3, 1, 4], sevenths: true, swing: 0.15,
  },
};

export const GENRES = Object.keys(STYLES) as Genre[];

export function renderBeat(spec: BeatSpec): Pcm {
  const st = STYLES[spec.genre];
  const r = rng(spec.seed);
  const [rootName, modeName] = spec.key.split(" ");
  const minor = (modeName ?? "minor").toLowerCase().startsWith("min");
  const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const penta = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const root = 48 + (NOTE[rootName] ?? 9); // octave 3
  const deg = (d: number) => root + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

  const beatSec = 60 / spec.bpm;
  const stepSec = beatSec / 4;
  const barSec = beatSec * 4;
  const targetSec = spec.seconds ?? 40;
  const bars = Math.max(8, Math.round(targetSec / barSec / 4) * 4);
  const total = Math.ceil((bars * barSec + 2.5) * SR);

  const L = new Float32Array(total), R = new Float32Array(total);
  const padL = new Float32Array(total), padR = new Float32Array(total);
  const send = new Float32Array(total);
  const duck = new Float32Array(total).fill(1);

  type Bus = "main" | "pad";
  function voice(t0: number, dur: number, gain: number, pan: number, rev: number, fn: (t: number) => number, bus: Bus = "main") {
    const s0 = Math.floor(t0 * SR);
    const n = Math.floor(dur * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    const outL = bus === "pad" ? padL : L, outR = bus === "pad" ? padR : R;
    for (let i = 0; i < n; i++) {
      const k = s0 + i;
      if (k >= total) break;
      const v = fn(i / SR);
      outL[k] += v * gl;
      outR[k] += v * gr;
      send[k] += v * rev * gain;
    }
  }
  const noise = () => r() * 2 - 1;

  // ---------- instruments
  const kick = (t0: number, v = 1) => {
    const s0 = Math.floor(t0 * SR);
    for (let i = 0; i < SR * 0.35 && s0 + i < total; i++) duck[s0 + i] = Math.min(duck[s0 + i], 0.35 + 0.65 * Math.min(1, i / (SR * 0.3)));
    voice(t0, 0.5, 0.95 * v, 0, 0.02, (t) => {
      const ph = TAU * (46 * t + (115 / 26) * (1 - Math.exp(-26 * t)));
      return Math.tanh(1.8 * Math.sin(ph) * Math.exp(-6.5 * t)) + 0.25 * noise() * Math.exp(-t * 400);
    });
  };
  const hpNoise = () => { let prev = 0; return () => { const n = noise(); const o = n - prev; prev = n; return o * 0.5; }; };
  const snare = (t0: number, v = 1) => {
    const hp = hpNoise();
    voice(t0, 0.32, 0.5 * v, 0.05, 0.22, (t) => 0.55 * Math.sin(TAU * 190 * t) * Math.exp(-22 * t) + 0.9 * hp() * Math.exp(-15 * t));
  };
  const clap = (t0: number, v = 1) => {
    const hp = hpNoise();
    voice(t0, 0.35, 0.42 * v, -0.05, 0.3, (t) => {
      const burst = t < 0.03 ? (Math.floor(t / 0.01) % 2 === 0 ? 1 : 0.3) : Math.exp(-(t - 0.03) * 16);
      return hp() * burst * 1.4;
    });
  };
  const rim = (t0: number, v = 1) =>
    voice(t0, 0.08, 0.22 * v, 0.35, 0.15, (t) => (Math.sin(TAU * 1650 * t) * 0.6 + Math.sin(TAU * 520 * t)) * Math.exp(-80 * t));
  const hat = (t0: number, open = false, v = 1, pan = 0.3) => {
    const hp = hpNoise();
    const dec = open ? 9 : 55;
    voice(t0, open ? 0.4 : 0.09, 0.2 * v, pan, 0.05, (t) => { const a = hp(); const b = hp(); return (a - b) * Math.exp(-dec * t); });
  };
  const shaker = (t0: number, v = 1) => {
    const hp = hpNoise();
    voice(t0, 0.12, 0.11 * v, -0.4, 0.08, (t) => hp() * Math.min(1, t / 0.012) * Math.exp(-32 * t));
  };
  const conga = (t0: number, f: number, v = 1) =>
    voice(t0, 0.3, 0.32 * v, -0.55, 0.15, (t) => Math.sin(TAU * (f * t + (f * 0.25 / 30) * (1 - Math.exp(-30 * t)))) * Math.exp(-13 * t) + 0.05 * noise() * Math.exp(-200 * t));
  const bell = (t0: number, v = 1) =>
    voice(t0, 0.35, 0.13 * v, 0.6, 0.25, (t) => (Math.sign(Math.sin(TAU * 560 * t)) * 0.4 + Math.sin(TAU * 845 * t)) * Math.exp(-11 * t));
  const logDrum = (t0: number, f: number, v = 1) =>
    voice(t0, 0.75, 0.62 * v, 0, 0.1, (t) => {
      const ph = TAU * (f * t + ((f * 0.6) / 28) * (1 - Math.exp(-28 * t)));
      const x = Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph);
      return Math.tanh(2.4 * x * Math.exp(-4.6 * t)) * 0.8;
    });
  const subBass = (t0: number, f: number, dur: number) =>
    voice(t0, dur + 0.08, 0.5, 0, 0, (t) => {
      const env = Math.min(1, t / 0.008) * (t > dur ? Math.exp(-(t - dur) * 60) : 1);
      return (Math.sin(TAU * f * t) + 0.18 * Math.sin(TAU * 2 * f * t)) * env;
    });
  const bass808 = (t0: number, f: number, dur: number, fromF?: number) =>
    voice(t0, dur + 0.15, 0.62, 0, 0, (t) => {
      const g = fromF ? f + (fromF - f) * Math.exp(-t * 18) : f;
      const ph = fromF ? TAU * (f * t + ((fromF - f) / 18) * (1 - Math.exp(-18 * t))) : TAU * g * t;
      const env = Math.min(1, t / 0.005) * Math.exp(-t * 0.9) * (t > dur ? Math.exp(-(t - dur) * 30) : 1);
      return Math.tanh(1.6 * Math.sin(ph)) * env;
    });
  const ep = (t0: number, f: number, dur: number, v = 1, pan = 0) =>
    voice(t0, dur + 0.6, 0.11 * v, pan, 0.35, (t) => {
      const idx = 1.6 * Math.exp(-t * 7);
      const env = Math.exp(-t * 1.4) * (t > dur ? Math.exp(-(t - dur) * 6) : 1) * Math.min(1, t / 0.004);
      return Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) * env + 0.15 * Math.sin(TAU * f * 14 * t) * Math.exp(-t * 40);
    }, "pad");
  const piano = (t0: number, f: number, dur: number, v = 1, pan = 0) =>
    voice(t0, dur + 1.2, 0.1 * v, pan, 0.4, (t) => {
      const env = Math.exp(-t * 2.2) * (t > dur ? Math.exp(-(t - dur) * 4) : 1) * Math.min(1, t / 0.003);
      return (Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * 2.003 * f * t) * Math.exp(-t * 3) + 0.2 * Math.sin(TAU * 3.01 * f * t) * Math.exp(-t * 5)) * env;
    }, "pad");
  const pad = (t0: number, f: number, dur: number, v = 1, pan = 0) =>
    voice(t0, dur + 1.2, 0.045 * v, pan, 0.55, (t) => {
      const env = Math.min(1, t / 0.35) * (t > dur ? Math.exp(-(t - dur) * 3) : 1);
      let s = 0;
      for (let h = 1; h <= 6; h++) s += (Math.sin(TAU * f * h * t * 1.002) + Math.sin(TAU * f * h * t * 0.998)) / (h * 1.4);
      return s * env * (0.85 + 0.15 * Math.sin(TAU * 0.3 * t));
    }, "pad");
  const pluck = (t0: number, f: number, v = 1, pan = 0.2) =>
    voice(t0, 0.9, 0.16 * v, pan, 0.4, (t) => (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * 4 * f * t) * Math.exp(-t * 35)) * Math.exp(-t * 5.5));
  const kalimba = (t0: number, f: number, v = 1, pan = -0.2) =>
    voice(t0, 1.2, 0.15 * v, pan, 0.5, (t) => (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 5.4 * f * t) * Math.exp(-t * 25)) * Math.exp(-t * 3.2) * Math.min(1, t / 0.002));
  const bellLead = (t0: number, f: number, v = 1, pan = 0.25) =>
    voice(t0, 1.4, 0.09 * v, pan, 0.55, (t) => Math.sin(TAU * f * t + 2.2 * Math.exp(-t * 3) * Math.sin(TAU * f * 3.5 * t)) * Math.exp(-t * 2.4));
  const guitar = (t0: number, f: number, v = 1, pan = 0.35) => {
    // Karplus–Strong plucked string — classic highlife palm-wine guitar texture.
    const n = Math.floor(SR * 1.1);
    const period = Math.max(2, Math.round(SR / f));
    const buf = new Float32Array(period).map(() => noise());
    const out = new Float32Array(n);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const a = buf[idx], b = buf[(idx + 1) % period];
      const y = 0.497 * (a + b);
      buf[idx] = y;
      out[i] = a;
      idx = (idx + 1) % period;
    }
    voice(t0, 1.1, 0.2 * v, pan, 0.3, (t) => out[Math.min(n - 1, Math.floor(t * SR))]);
  };

  // ---------- arrangement
  const swingT = (step: number) => (step % 2 === 1 ? st.swing * stepSec : 0);
  const at = (bar: number, step: number) => bar * barSec + step * stepSec + swingT(step);
  const leadNotes: number[] = [];
  for (let i = 0; i < 16; i++) leadNotes.push(r() < 0.35 ? -1 : penta[Math.floor(r() * penta.length)] + (r() < 0.3 ? 12 : 0));
  const leadRhythm = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? r() < 0.75 : r() < 0.3));
  const fillBar = (b: number) => b % 4 === 3;

  for (let bar = 0; bar < bars; bar++) {
    const section = bar < 2 ? "intro" : bar >= bars / 2 && bar < bars / 2 + 2 ? "break" : bar >= bars / 2 ? "b" : "a";
    const d = st.prog[bar % st.prog.length];
    const chord = [deg(d) + 12, deg(d + 2) + 12, deg(d + 4) + 12].concat(st.sevenths ? [deg(d + 6) + 12] : []);
    const bassRoot = deg(d) - 12;
    const drums = section === "a" || section === "b";

    // harmony
    if (st.keys === "guitar") {
      for (let s = 0; s < 16; s += 2) guitar(at(bar, s), mtof(chord[(s / 2) % chord.length] + (s % 4 === 2 ? 12 : 0)), s % 4 === 0 ? 1 : 0.7);
    } else if (st.chordStabs.length && section !== "intro") {
      for (const s of st.chordStabs) chord.forEach((m, i) => ep(at(bar, s), mtof(m), stepSec * 1.6, 0.9, (i - 1.5) * 0.25));
    } else {
      const inst = st.keys === "ep" ? ep : st.keys === "piano" ? piano : pad;
      chord.forEach((m, i) => inst(at(bar, 0), mtof(m), barSec * 0.95, 1, (i - 1.5) * 0.3));
      if (st.keys === "piano" && section !== "intro") chord.forEach((m, i) => piano(at(bar, 10), mtof(m), stepSec * 3, 0.55, (i - 1.5) * 0.3));
    }
    if (st.pad) chord.forEach((m, i) => pad(at(bar, 0), mtof(m - 12), barSec, 0.8, i % 2 ? 0.5 : -0.5));

    // drums
    if (drums) {
      st.kick.forEach((s) => kick(at(bar, s)));
      if (st.halfTime && bar % 2 === 1) kick(at(bar, 6), 0.8);
    }
    if (drums || section === "break") {
      st.snare.forEach((s) => snare(at(bar, s)));
      st.clap.forEach((s) => clap(at(bar, s), section === "break" ? 0.6 : 1));
    }
    st.rim.forEach((s) => rim(at(bar, s), section === "intro" ? 0.6 : 1));
    if (section !== "intro" || bar === 1) {
      st.hat.forEach((s) => hat(at(bar, s), false, s % 4 === 0 ? 0.7 : 1, 0.3));
      st.openHat.forEach((s) => hat(at(bar, s), true, 0.8, -0.2));
      if (st.hatRolls && fillBar(bar)) for (let k = 0; k < 6; k++) hat(at(bar, 12) + (k * stepSec * 4) / 6, false, 0.55 + k * 0.08, 0.1);
    }
    if (st.shaker) for (let s = 0; s < 16; s++) shaker(at(bar, s), s % 2 ? 1 : 0.55);
    st.conga.forEach((s, i) => conga(at(bar, s), i % 2 ? 210 : 290, 0.9));
    st.bell.forEach((s) => bell(at(bar, s), s === 0 ? 1 : 0.75));

    // low end
    if (section !== "intro" && section !== "break") {
      st.log.forEach(([s, off], i) => logDrum(at(bar, s), mtof(deg(d + off) - 12), i === 0 ? 1 : 0.85));
      if (st.bassType === "sub") st.bass.forEach(([s, off, len]) => subBass(at(bar, s), mtof(deg(d + off) - 12), len * stepSec * 0.92));
      if (st.bassType === "808")
        st.bass.forEach(([s, off, len], i) => bass808(at(bar, s), mtof(deg(d + off) - 12), len * stepSec, i === 2 ? mtof(bassRoot + 12) : undefined));
    }

    // lead melody in second half
    if (st.lead !== "none" && (section === "b" || (section === "a" && bar % 4 >= 2))) {
      const fn = st.lead === "pluck" ? pluck : st.lead === "kalimba" ? kalimba : bellLead;
      for (let s = 0; s < 16; s++) {
        const n = leadNotes[(s + (bar % 2) * 8) % 16];
        if (n >= 0 && leadRhythm[s]) fn(at(bar, s), mtof(root + 24 + n), 0.8 + 0.2 * r(), (r() - 0.5) * 0.6);
      }
    }
  }

  // ---------- mix: duck pads under kick, Schroeder reverb, gentle master saturation
  for (let i = 0; i < total; i++) {
    L[i] += padL[i] * duck[i];
    R[i] += padR[i] * duck[i];
  }
  const scaleD = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => Math.floor(d * scaleD));
  const apL = [556, 441].map((d) => Math.floor(d * scaleD));
  const reverb = (offset: number) => {
    const out = new Float32Array(total);
    for (const dl of combs) {
      const D = dl + offset;
      const buf = new Float32Array(D);
      let idx = 0, filt = 0;
      for (let i = 0; i < total; i++) {
        const y = buf[idx];
        filt = y * 0.65 + filt * 0.35;
        buf[idx] = send[i] + filt * 0.8;
        out[i] += y;
        idx = (idx + 1) % D;
      }
    }
    for (const dl of apL) {
      const D = dl + offset;
      const buf = new Float32Array(D);
      let idx = 0;
      for (let i = 0; i < total; i++) {
        const bo = buf[idx];
        const x = out[i];
        buf[idx] = x + bo * 0.5;
        out[i] = bo - x * 0.5;
        idx = (idx + 1) % D;
      }
    }
    return out;
  };
  const rl = reverb(0), rr = reverb(23);
  let peak = 0;
  for (let i = 0; i < total; i++) {
    L[i] += rl[i] * 0.09;
    R[i] += rr[i] * 0.09;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const gain = 1.05 / Math.max(peak, 1e-6);
  const fadeIn = SR * 0.02;
  for (let i = 0; i < total; i++) {
    const f = Math.min(1, i / fadeIn) * Math.min(1, (total - i) / (SR * 2));
    L[i] = Math.tanh(L[i] * gain) * 0.95 * f;
    R[i] = Math.tanh(R[i] * gain) * 0.95 * f;
  }
  return { sampleRate: SR, channels: [L, R] };
}
