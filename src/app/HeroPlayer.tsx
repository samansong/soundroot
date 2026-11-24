"use client";
import Link from "next/link";
import { beatTrack, type BeatLite } from "@/components/beats";
import { IconPause, IconPlay } from "@/components/icons";
import { player, usePlayer } from "@/components/player-store";
import { Spectrum } from "@/components/visuals";

/** Floating glass "now playing" capsule that sits on the hero photo. */
export function HeroPlayer({ beat }: { beat: BeatLite }) {
  const current = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  return (
    <div className="glass-pane hero-player fade-up" style={{ animationDelay: "250ms" }}>
      <button
        className={`hp-btn ${playing ? "" : "pulse-ring"}`}
        onClick={() => (current ? player.toggle() : player.play(beatTrack(beat)))}
        aria-label={playing ? "Pause" : `Play ${beat.title}`}
      >
        {playing ? <IconPause /> : <IconPlay style={{ marginLeft: 3 }} />}
      </button>
      <div style={{ minWidth: 0 }}>
        <div className="xs" style={{ letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 700, color: "rgba(255,255,255,.6)" }}>
          {playing ? "Now playing" : "Press play"}
        </div>
        <Link href={current?.href ?? `/beats/${beat.id}`} className="hp-title">{current?.title ?? beat.title}</Link>
        <div className="small" style={{ color: "rgba(255,255,255,.65)" }}>{current?.subtitle ?? `${beat.producer.name} · ${beat.genre}`}</div>
      </div>
      <Spectrum hue={current?.hue ?? 40} bars={14} className="hp-spectrum" />
    </div>
  );
}
