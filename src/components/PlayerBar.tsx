"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Artwork } from "./Artwork";
import { IconNext, IconPause, IconPlay, IconPrev, IconVolume } from "./icons";
import { player, usePlayer } from "./player-store";
import { fmtTime, Spectrum, Waveform } from "./visuals";

export function PlayerBar() {
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const volume = usePlayer((s) => s.volume);
  const loading = usePlayer((s) => s.loading);

  // Space toggles playback anywhere except while typing.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code === "Space" && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName) && t.getAttribute("role") !== "slider" && player.getState().track) {
        e.preventDefault();
        player.toggle();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const hue = track?.hue ?? 168;
  return (
    <section className={`playerbar ${track ? "show" : ""}`} aria-label="Audio player" style={{ ["--pb-glow" as any]: `hsl(${hue} 80% 60%)` }}>
      {track && (
        <>
          <div className="pb-track">
            <Artwork seed={track.artSeed ?? 1} hue={hue} />
            <div style={{ minWidth: 0 }}>
              {track.href ? <Link href={track.href} className="truncate" style={{ display: "block", fontWeight: 750, fontFamily: "var(--font-display)" }}>{track.title}</Link> : <b className="truncate">{track.title}</b>}
              <div className="muted small truncate">{track.subtitle}</div>
              {track.kind === "beat" && <div className="xs gold" style={{ fontWeight: 700 }}>Tagged preview</div>}
            </div>
          </div>
          <div className="pb-controls">
            <button className="btn btn-ghost btn-icon btn-sm" onClick={player.prev} aria-label="Previous"><IconPrev /></button>
            <button className="pb-play" onClick={() => player.toggle()} aria-label={playing ? "Pause" : "Play"}>
              {loading && playing ? <span className="spin" style={{ width: 18, height: 18, border: "2px solid #0b1519", borderTopColor: "transparent", borderRadius: "50%" }} /> : playing ? <IconPause /> : <IconPlay />}
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={player.next} aria-label="Next"><IconNext /></button>
          </div>
          <div className="pb-wave">
            <span>{fmtTime(time)}</span>
            <Waveform peaks={track.waveform} progress={duration ? time / duration : 0} duration={duration} onSeek={player.seekFraction} height={40} hue={hue} label="Seek in current track" />
            <span>{fmtTime(duration)}</span>
          </div>
          <div className="pb-right">
            <Spectrum hue={hue} />
            <IconVolume width={18} height={18} className="muted" />
            <input className="range" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => player.setVolume(Number(e.target.value))} aria-label="Volume" />
          </div>
        </>
      )}
    </section>
  );
}
