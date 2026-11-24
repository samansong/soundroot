// Deterministic generative cover art — geometric, kente/adinkra-inspired. Every beat gets its own.
import { memo } from "react";

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ArtworkSvg = memo(function ArtworkSvg({ seed, hue, variant }: { seed: number; hue: number; variant?: number }) {
  const r = rng(seed);
  const v = variant ?? seed % 4;
  const id = `a${seed}`;
  const c1 = `hsl(${hue} 70% 55%)`;
  const c2 = `hsl(${(hue + 40) % 360} 75% 62%)`;
  const c3 = `hsl(${(hue + 180) % 360} 60% 60%)`;
  const gold = "#f2b84b";
  const bg1 = `hsl(${hue} 45% 14%)`;
  const bg2 = `hsl(${(hue + 30) % 360} 50% 7%)`;
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id={`${id}bg`} cx="30%" cy="20%" r="100%">
          <stop offset="0" stopColor={`hsl(${hue} 55% 26%)`} />
          <stop offset="0.55" stopColor={bg1} />
          <stop offset="1" stopColor={bg2} />
        </radialGradient>
        <linearGradient id={`${id}g`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={c2} />
          <stop offset="1" stopColor={c1} />
        </linearGradient>
        <clipPath id={`${id}c`}><circle cx="100" cy="96" r="54" /></clipPath>
      </defs>
      <rect width="200" height="200" fill={`url(#${id}bg)`} />
      {v === 0 && (
        <g>
          <circle cx="100" cy="96" r="54" fill={`url(#${id}g)`} />
          <g clipPath={`url(#${id}c)`}>
            {Array.from({ length: 7 }, (_, i) => <rect key={i} x="40" y={110 + i * 8} width="120" height={2 + i * 0.8} fill={bg1} />)}
          </g>
          {Array.from({ length: 5 }, (_, i) => <rect key={i} x="0" y={160 + i * 7} width="200" height="3" fill={i % 2 ? gold : c3} opacity={0.75 - i * 0.12} />)}
        </g>
      )}
      {v === 1 && (
        <g fill="none">
          {Array.from({ length: 11 }, (_, i) => (
            <circle key={i} cx={70 + r() * 60} cy={70 + r() * 60} r={12 + i * 9} stroke={i % 3 === 0 ? gold : i % 3 === 1 ? c1 : c2} strokeWidth={1 + r() * 2.5} opacity={0.85 - i * 0.05} />
          ))}
          <circle cx="100" cy="100" r="9" fill={gold} />
        </g>
      )}
      {v === 2 && (
        <g>
          {Array.from({ length: 6 }, (_, y) =>
            Array.from({ length: 6 }, (_, x) => {
              const k = (x + y + Math.floor(r() * 3)) % 4;
              const fill = [c1, gold, c3, bg1][k];
              return (
                <g key={`${x}-${y}`} transform={`translate(${x * 34 - 2} ${y * 34 - 2})`}>
                  <rect width="34" height="34" fill={fill} opacity={0.9} />
                  {k !== 3 && Array.from({ length: 4 }, (_, s) => <rect key={s} x="0" y={4 + s * 8} width="34" height="2" fill={bg2} opacity="0.55" />)}
                  {k === 3 && <path d="M17 6 28 17 17 28 6 17Z" fill={c2} />}
                </g>
              );
            }),
          )}
          <rect width="200" height="200" fill={`url(#${id}bg)`} opacity="0.35" />
        </g>
      )}
      {v === 3 && (
        <g fill="none" strokeLinecap="round">
          {Array.from({ length: 9 }, (_, i) => {
            const amp = 8 + r() * 26;
            const f = 1 + Math.floor(r() * 3);
            const y0 = 40 + i * 15;
            let d = `M -10 ${y0}`;
            for (let x = -10; x <= 210; x += 10) d += ` L ${x} ${(y0 + Math.sin((x / 200) * Math.PI * 2 * f + i) * amp * Math.sin((x / 200) * Math.PI)).toFixed(1)}`;
            return <path key={i} d={d} stroke={i % 3 === 0 ? gold : i % 2 ? c1 : c2} strokeWidth={1.5 + (i % 3)} opacity={0.4 + (i / 9) * 0.6} />;
          })}
        </g>
      )}
      <g opacity="0.55">
        {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={r() * 200} cy={r() * 200} r={r() * 1.3} fill="white" />)}
      </g>
    </svg>
  );
});

export function Artwork({ seed, hue, size, className = "", children, radius }: { seed: number; hue: number; size?: number | string; className?: string; children?: React.ReactNode; radius?: number }) {
  return (
    <div className={`art ${className}`} style={{ width: size, borderRadius: radius }}>
      <ArtworkSvg seed={seed} hue={hue} />
      {children}
    </div>
  );
}
