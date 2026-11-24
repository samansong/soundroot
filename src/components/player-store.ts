"use client";
// Global audio engine: one <audio> element + Web Audio analyser shared by every visualizer.
// Lives outside React so playback persists across client-side navigation.
import { useSyncExternalStore } from "react";

export interface Track {
  id: string;
  title: string;
  subtitle: string;
  src: string;
  hue: number;
  artSeed?: number;
  waveform?: number[] | null;
  href?: string;
  kind?: "beat" | "version";
}

interface State {
  track: Track | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  queue: Track[];
  loading: boolean;
}

let state: State = { track: null, playing: false, time: 0, duration: 0, volume: 0.9, queue: [], loading: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<State>) => { state = { ...state, ...p }; emit(); };

let audio: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let freq: Uint8Array<ArrayBuffer> | null = null;
let wave: Uint8Array<ArrayBuffer> | null = null;

function el() {
  if (audio || typeof window === "undefined") return audio;
  audio = new Audio();
  audio.preload = "metadata";
  audio.volume = state.volume;
  audio.addEventListener("timeupdate", () => set({ time: audio!.currentTime }));
  audio.addEventListener("durationchange", () => set({ duration: isFinite(audio!.duration) ? audio!.duration : 0 }));
  audio.addEventListener("play", () => set({ playing: true }));
  audio.addEventListener("pause", () => set({ playing: false }));
  audio.addEventListener("waiting", () => set({ loading: true }));
  audio.addEventListener("playing", () => set({ loading: false }));
  audio.addEventListener("ended", () => { set({ playing: false }); next(); });
  return audio;
}

function ensureGraph() {
  if (ctx || !audio) return;
  try {
    ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
    wave = new Uint8Array(analyser.fftSize);
  } catch {
    /* visualizers fall back to idle animation */
  }
}

export const player = {
  play(track: Track, queue?: Track[]) {
    const a = el();
    if (!a) return;
    if (queue) set({ queue });
    if (state.track?.id === track.id && state.track.src === track.src) {
      ensureGraph();
      void ctx?.resume();
      void a.play();
      return;
    }
    set({ track, time: 0, duration: 0, loading: true });
    a.src = track.src;
    ensureGraph();
    void ctx?.resume();
    void a.play().catch(() => set({ playing: false, loading: false }));
  },
  toggle(track?: Track, queue?: Track[]) {
    const a = el();
    if (!a) return;
    if (track && state.track?.id !== track.id) return player.play(track, queue);
    if (!state.track) return;
    if (a.paused) { ensureGraph(); void ctx?.resume(); void a.play(); } else a.pause();
  },
  pause() { audio?.pause(); },
  seek(seconds: number) {
    const a = el();
    if (!a || !isFinite(seconds)) return;
    a.currentTime = Math.max(0, Math.min(seconds, a.duration || seconds));
    set({ time: a.currentTime });
  },
  seekFraction(f: number) { if (state.duration) player.seek(f * state.duration); },
  setVolume(v: number) { const a = el(); if (a) a.volume = v; set({ volume: v }); },
  next,
  prev() {
    if (state.time > 3) return player.seek(0);
    const i = state.queue.findIndex((t) => t.id === state.track?.id);
    if (i > 0) player.play(state.queue[i - 1]);
  },
  /** Frequency data 0..255 per bin, or null when idle. */
  frequencies(): Uint8Array | null {
    if (!analyser || !freq || !state.playing) return null;
    analyser.getByteFrequencyData(freq);
    return freq;
  },
  waveform(): Uint8Array | null {
    if (!analyser || !wave || !state.playing) return null;
    analyser.getByteTimeDomainData(wave);
    return wave;
  },
  /** Smoothed band energies 0..1 for ambient visuals. */
  energy(): { bass: number; mid: number; high: number; level: number } {
    const f = player.frequencies();
    if (!f) return { bass: 0, mid: 0, high: 0, level: 0 };
    const avg = (a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += f[i]; return s / (b - a) / 255; };
    const bass = avg(1, 8), mid = avg(8, 60), high = avg(60, 200);
    return { bass, mid, high, level: (bass + mid + high) / 3 };
  },
  getState: () => state,
};

function next() {
  const i = state.queue.findIndex((t) => t.id === state.track?.id);
  if (i >= 0 && i < state.queue.length - 1) player.play(state.queue[i + 1]);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const server: State = { track: null, playing: false, time: 0, duration: 0, volume: 0.9, queue: [], loading: false };

export function usePlayer<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(server));
}
