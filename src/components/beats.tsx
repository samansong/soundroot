"use client";
import Link from "next/link";
import { Artwork } from "./Artwork";
import { IconPause, IconPlay } from "./icons";
import { player, usePlayer, type Track } from "./player-store";
import { money } from "./ui";
import { Waveform } from "./visuals";

export interface BeatLite {
  id: string; title: string; genre: string; mood?: string; bpm: number; key: string; hue: number; artSeed: number;
  waveform: number[] | null; previewUrl: string | null; fromMinor: number | null; hasFree?: boolean; status?: string;
  producer: { name: string; slug: string };
}

export const beatTrack = (b: BeatLite): Track => ({
  id: b.id, title: b.title, subtitle: `${b.producer.name} · ${b.genre} · ${b.bpm} BPM`, src: `${b.previewUrl}?play=1`,
  hue: b.hue, artSeed: b.artSeed, waveform: b.waveform, href: `/beats/${b.id}`, kind: "beat",
});

export function useIsPlaying(id: string) {
  const current = usePlayer((s) => s.track?.id === id);
  const playing = usePlayer((s) => s.playing);
  return { current, playing: current && playing };
}

export function PlayButton({ beat, queue, size = 46 }: { beat: BeatLite; queue?: BeatLite[]; size?: number }) {
  const { playing } = useIsPlaying(beat.id);
  if (!beat.previewUrl) return null;
  return (
    <button
      className="play-disc"
      style={{ width: size, height: size, border: "none", cursor: "pointer" }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); player.toggle(beatTrack(beat), queue?.filter((b) => b.previewUrl).map(beatTrack)); }}
      aria-label={playing ? `Pause ${beat.title}` : `Play preview of ${beat.title}`}
    >
      {playing ? <IconPause /> : <IconPlay />}
    </button>
  );
}

export function Eq({ paused }: { paused?: boolean }) {
  return <span className={`eq ${paused ? "paused" : ""}`} aria-hidden><i /><i /><i /><i /></span>;
}

export function BeatCard({ beat, queue, index = 0 }: { beat: BeatLite; queue?: BeatLite[]; index?: number }) {
  const { current, playing } = useIsPlaying(beat.id);
  return (
    <Link href={`/beats/${beat.id}`} className={`beat-card fade-up ${current ? "playing" : ""}`} style={{ ["--glow" as any]: `hsl(${beat.hue} 80% 55% / .55)`, animationDelay: `${index * 45}ms` }}>
      <Artwork seed={beat.artSeed} hue={beat.hue}>
        <div className={`art-play ${current ? "show" : ""}`}><PlayButton beat={beat} queue={queue} /></div>
      </Artwork>
      <div className="meta">
        <div className="row between">
          <span className="title truncate">{beat.title}</span>
          {current && <Eq paused={!playing} />}
        </div>
        <span className="muted small truncate">{beat.producer.name}</span>
        <div className="row between" style={{ marginTop: 6 }}>
          <div className="tags"><span className="tag">{beat.genre}</span><span className="tag">{beat.bpm} BPM</span></div>
          <span className="price">{beat.fromMinor != null ? money(beat.fromMinor) : "Free"}</span>
        </div>
      </div>
    </Link>
  );
}

export function BeatRow({ beat, queue, index }: { beat: BeatLite; queue?: BeatLite[]; index: number }) {
  const { current, playing } = useIsPlaying(beat.id);
  const time = usePlayer((s) => (s.track?.id === beat.id ? s.time : 0));
  const duration = usePlayer((s) => (s.track?.id === beat.id ? s.duration : 0));
  return (
    <div className={`beat-row ${current ? "playing" : ""}`} style={{ ["--glow" as any]: `hsl(${beat.hue} 80% 55%)` }}>
      <span className="idx">{current ? <Eq paused={!playing} /> : String(index + 1).padStart(2, "0")}</span>
      <Artwork seed={beat.artSeed} hue={beat.hue} size={56}>
        <div className={`art-play ${current ? "show" : ""}`}><PlayButton beat={beat} queue={queue} size={34} /></div>
      </Artwork>
      <Link href={`/beats/${beat.id}`} style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 750, fontFamily: "var(--font-display)" }} className="truncate">{beat.title}</div>
        <div className="muted small truncate">{beat.producer.name} · {beat.genre} · {beat.bpm} BPM · {beat.key}</div>
      </Link>
      <div className="wf">
        <Waveform
          peaks={beat.waveform}
          progress={duration ? time / duration : 0}
          duration={duration}
          height={36}
          hue={beat.hue}
          active={current}
          label={`Seek ${beat.title}`}
          onSeek={(f) => { if (current) player.seekFraction(f); else { player.play(beatTrack(beat), queue?.map(beatTrack)); } }}
        />
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 800 }} className="gold">{beat.fromMinor != null ? money(beat.fromMinor) : "Free"}</div>
        {beat.hasFree && <div className="xs teal">Free promo tier</div>}
      </div>
      <div className="actions" style={{ textAlign: "right" }}>
        <Link href={`/beats/${beat.id}`} className="btn btn-sm">View license</Link>
      </div>
    </div>
  );
}
