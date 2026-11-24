"use client";
import Link from "next/link";
import { beatTrack, type BeatLite } from "@/components/beats";
import { IconPause, IconPlay } from "@/components/icons";
import { player, usePlayer } from "@/components/player-store";
import { Orb } from "@/components/visuals";

export function HeroOrb({ beat }: { beat: BeatLite }) {
  const current = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const hue = current?.hue ?? 40;
  return (
    <div className="orb-wrap fade-up" style={{ animationDelay: "150ms" }}>
      <Orb hue={hue} />
      <div className="orb-center">
        <button className={`orb-btn ${playing ? "" : "pulse-ring"}`} onClick={() => (current ? player.toggle() : player.play(beatTrack(beat)))} aria-label={playing ? "Pause" : `Play ${beat.title}`}>
          {playing ? <IconPause /> : <IconPlay style={{ marginLeft: 4 }} />}
        </button>
      </div>
      <div className="orb-caption">
        <div className="xs muted" style={{ letterSpacing: ".2em", textTransform: "uppercase", fontWeight: 700 }}>{playing ? "Now playing" : "Press play"}</div>
        <Link href={current?.href ?? `/beats/${beat.id}`} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem" }}>
          {current?.title ?? beat.title}
        </Link>
        <div className="small muted">{current?.subtitle ?? `${beat.producer.name} · ${beat.genre}`}</div>
      </div>
    </div>
  );
}
