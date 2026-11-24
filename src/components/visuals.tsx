"use client";
// Audio-reactive visuals: ambient background, hero orb, mini spectrum and the interactive waveform.
import { useEffect, useRef } from "react";
import { player, usePlayer } from "./player-store";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void, deps: unknown[] = [], fps = 60) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0, last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 1000 / fps - 2) return;
      last = t;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, w, h, t / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Full-screen ambient field: drifting light orbs + rising dust that breathe with the music. */
export function Ambient() {
  const hue = usePlayer((s) => s.track?.hue ?? 168);
  const smooth = useRef({ bass: 0, mid: 0, high: 0, hue: 168 });
  const dust = useRef<{ x: number; y: number; v: number; r: number; a: number }[]>([]);
  const ref = useCanvas((ctx, w, h, t) => {
    const e = player.energy();
    const s = smooth.current;
    s.bass += (e.bass - s.bass) * 0.18;
    s.mid += (e.mid - s.mid) * 0.12;
    s.high += (e.high - s.high) * 0.12;
    s.hue += (((hue - s.hue + 540) % 360) - 180) * 0.02;
    const still = reduced();
    const tt = still ? 0 : t;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const orbs = [
      { x: 0.78 + Math.sin(tt * 0.07) * 0.08, y: 0.12 + Math.cos(tt * 0.05) * 0.06, r: 0.55, hue: 40, a: 0.16 },
      { x: 0.18 + Math.cos(tt * 0.06) * 0.07, y: 0.35 + Math.sin(tt * 0.08) * 0.08, r: 0.5, hue: s.hue, a: 0.14 },
      { x: 0.55 + Math.sin(tt * 0.05 + 2) * 0.1, y: 0.85 + Math.cos(tt * 0.07) * 0.05, r: 0.6, hue: 168, a: 0.12 },
      { x: 0.92 + Math.cos(tt * 0.04) * 0.05, y: 0.65, r: 0.4, hue: 265, a: 0.1 },
    ];
    for (const [i, o] of orbs.entries()) {
      const boost = 1 + (i === 1 ? s.bass * 0.9 : i === 0 ? s.mid * 0.6 : s.high * 0.5);
      const R = Math.max(w, h) * o.r * (0.85 + 0.15 * boost);
      const g = ctx.createRadialGradient(o.x * w, o.y * h, 0, o.x * w, o.y * h, R);
      g.addColorStop(0, `hsla(${o.hue}, 75%, 55%, ${o.a * (0.7 + boost * 0.5)})`);
      g.addColorStop(1, `hsla(${o.hue}, 75%, 40%, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // rising dust
    if (dust.current.length === 0) dust.current = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: 0.0003 + Math.random() * 0.001, r: 0.4 + Math.random() * 1.6, a: Math.random() }));
    for (const d of dust.current) {
      if (!still) { d.y -= d.v * (1 + s.high * 6); d.x += Math.sin(t * 0.5 + d.a * 10) * 0.0002; }
      if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      ctx.fillStyle = `hsla(${d.a > 0.5 ? 40 : 168}, 90%, 75%, ${0.15 + d.a * 0.35 + s.high * 0.5})`;
      ctx.beginPath();
      ctx.arc(d.x * w, d.y * h, d.r * (1 + s.bass), 0, Math.PI * 2);
      ctx.fill();
    }
    // bass shockwave ring along the bottom edge
    if (s.bass > 0.05) {
      ctx.strokeStyle = `hsla(${s.hue}, 80%, 65%, ${s.bass * 0.25})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(w * 0.6, h * 1.05, w * (0.4 + s.bass * 0.3), h * (0.25 + s.bass * 0.2), 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [hue], 40);
  return (
    <>
      <div className="ambient" aria-hidden><canvas ref={ref} /></div>
      <div className="kente" aria-hidden />
      <div className="grain" aria-hidden />
    </>
  );
}

/** Circular radial visualizer — idles as a breathing sun, explodes into a spectrum when playing. */
export function Orb({ hue = 40 }: { hue?: number }) {
  const sm = useRef<number[]>([]);
  const ref = useCanvas((ctx, w, h, t) => {
    const cx = w / 2, cy = h / 2;
    const base = Math.min(w, h) * 0.26;
    const f = player.frequencies();
    const bins = 120;
    if (sm.current.length !== bins) sm.current = new Array(bins).fill(0);
    const still = reduced();
    ctx.clearRect(0, 0, w, h);
    const e = player.energy();
    // glow
    const g = ctx.createRadialGradient(cx, cy, base * 0.2, cx, cy, base * 2.2);
    g.addColorStop(0, `hsla(${hue}, 90%, 65%, ${0.35 + e.bass * 0.4})`);
    g.addColorStop(0.5, `hsla(${(hue + 140) % 360}, 70%, 45%, 0.12)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < bins; i++) {
      const target = f ? f[Math.floor(2 + (i < bins / 2 ? i : bins - i) * 2.2)] / 255 : (still ? 0.25 : 0.18 + 0.12 * Math.sin(t * 1.6 + i * 0.35) * Math.sin(t * 0.7 + i * 0.11));
      sm.current[i] += (target - sm.current[i]) * 0.25;
    }
    // orbiting rings
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = `hsla(${ring === 1 ? 168 : hue}, 70%, 70%, ${0.12 - ring * 0.03})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, base * (1.55 + ring * 0.28 + e.bass * 0.15), 0, Math.PI * 2);
      ctx.stroke();
    }
    // spectrum bars
    for (let i = 0; i < bins; i++) {
      const a = (i / bins) * Math.PI * 2 - Math.PI / 2 + (still ? 0 : t * 0.05);
      const v = sm.current[i];
      const r0 = base * (1.02 + e.bass * 0.1);
      const r1 = r0 + 8 + v * base * 0.95;
      const hueI = i % 2 ? hue : (hue + 130) % 360;
      ctx.strokeStyle = `hsla(${hueI}, 85%, ${60 + v * 20}%, ${0.55 + v * 0.45})`;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    // inner waveform loop
    const wv = player.waveform();
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const s = wv ? (wv[Math.floor((i / 180) * (wv.length - 1))] - 128) / 128 : Math.sin(a * 6 + t * 2) * 0.05;
      const rr = base * (0.78 + s * 0.35);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `hsla(${hue}, 90%, 75%, 0.65)`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }, [hue]);
  return <canvas ref={ref} aria-hidden />;
}

/** Tiny live spectrum for the player bar. */
export function Spectrum({ hue, bars = 18, className = "pb-spectrum" }: { hue: number; bars?: number; className?: string }) {
  const sm = useRef<number[]>(new Array(bars).fill(0));
  const ref = useCanvas((ctx, w, h, t) => {
    const f = player.frequencies();
    ctx.clearRect(0, 0, w, h);
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const target = f ? f[Math.floor(Math.pow(i / bars, 1.6) * 180) + 1] / 255 : 0.08 + 0.04 * Math.sin(t * 2 + i);
      sm.current[i] += (target - sm.current[i]) * 0.3;
      const bh = Math.max(2, sm.current[i] * h);
      const grd = ctx.createLinearGradient(0, h, 0, h - bh);
      grd.addColorStop(0, `hsla(${hue}, 80%, 55%, 0.9)`);
      grd.addColorStop(1, `hsla(${(hue + 60) % 360}, 90%, 75%, 0.9)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.roundRect(i * bw + 1, h - bh, bw - 2, bh, 2);
      ctx.fill();
    }
  }, [hue, bars], 45);
  return <canvas ref={ref} className={className} aria-hidden />;
}

export interface Marker { ms: number; color: string; label?: string; id: string; title?: string }

/**
 * Interactive waveform: renders peaks, played progress, hover scrub line and comment markers.
 * Keyboard: ←/→ seek 5s when focused.
 */
export function Waveform({
  peaks, progress, duration, onSeek, height = 72, hue = 168, markers = [], onMarker, active = true, label = "Seek",
}: {
  peaks: number[] | null | undefined; progress: number; duration: number; onSeek?: (fraction: number) => void; height?: number; hue?: number;
  markers?: Marker[]; onMarker?: (m: Marker) => void; active?: boolean; label?: string;
}) {
  const hover = useRef<number | null>(null);
  const prog = useRef(progress);
  prog.current = progress;
  const ref = useCanvas((ctx, w, h) => {
    const raw = peaks && peaks.length ? peaks : Array.from({ length: 120 }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.4)));
    // Expand dynamic range so dense, loud masters still show their arrangement.
    let lo = 1, hi = 0;
    for (const x of raw) { if (x < lo) lo = x; if (x > hi) hi = x; }
    const span = hi - lo || 1;
    const p = raw.map((x) => 0.12 + 0.88 * Math.pow((x - lo) / span, 1.5));
    ctx.clearRect(0, 0, w, h);
    const n = Math.min(p.length, Math.floor(w / 3.2));
    const step = p.length / n;
    const bw = w / n;
    const e = active ? player.energy() : { level: 0 };
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step); j++) v = Math.max(v, p[j] ?? 0);
      const x = i * bw;
      const frac = (i + 0.5) / n;
      const played = frac <= prog.current;
      const near = played && prog.current - frac < 0.015;
      const bh = Math.max(3, v * h * 0.92 * (near ? 1 + e.level * 0.6 : 1));
      if (played) {
        const g = ctx.createLinearGradient(0, h / 2 - bh / 2, 0, h / 2 + bh / 2);
        g.addColorStop(0, `hsl(${(hue + 40) % 360} 90% 72%)`);
        g.addColorStop(1, `hsl(${hue} 80% 55%)`);
        ctx.fillStyle = g;
      } else {
        const hv = hover.current !== null && frac <= hover.current;
        ctx.fillStyle = hv ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.2)";
      }
      ctx.beginPath();
      ctx.roundRect(x + 0.6, h / 2 - bh / 2, Math.max(1.2, bw - 1.4), bh, 2);
      ctx.fill();
    }
    if (hover.current !== null) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(hover.current * w, 0, 1, h);
    }
  }, [peaks, hue, active], 50);

  const fracFrom = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  return (
    <div
      className="waveform"
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(progress * duration)}
      aria-valuetext={`${fmtTime(progress * duration)} of ${fmtTime(duration)}`}
      onPointerMove={(e) => { hover.current = fracFrom(e); }}
      onPointerLeave={() => { hover.current = null; }}
      onPointerDown={(e) => onSeek?.(fracFrom(e))}
      onKeyDown={(e) => {
        if (!duration) return;
        if (e.key === "ArrowRight") { e.preventDefault(); onSeek?.(Math.min(1, progress + 5 / duration)); }
        if (e.key === "ArrowLeft") { e.preventDefault(); onSeek?.(Math.max(0, progress - 5 / duration)); }
      }}
    >
      <canvas ref={ref} />
      {duration > 0 && markers.map((m) => (
        <button
          key={m.id}
          type="button"
          className="wf-marker"
          title={m.title}
          aria-label={`Comment at ${fmtTime(m.ms / 1000)}`}
          style={{ left: `${Math.min(100, (m.ms / 1000 / duration) * 100)}%`, background: m.color }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onMarker?.(m); }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
