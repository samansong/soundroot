import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBeat, searchBeats } from "@/server/modules/catalog";
import { getActor } from "@/server/session";
import { ArtworkSvg, Artwork } from "@/components/Artwork";
import { BeatCard } from "@/components/beats";
import { StatusBadge } from "@/components/ui";
import { BeatHeroPlayer, LicensePicker } from "./client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try { const b = getBeat((await params).id, null); return { title: `${b.title} by ${b.producer.name}` }; } catch { return { title: "Beat" }; }
}

export default async function BeatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  let beat;
  try { beat = getBeat(id, actor); } catch { notFound(); }
  const more = searchBeats({ producer: beat.producer.slug, pageSize: 5 }).items.filter((b) => b.id !== beat.id).slice(0, 4);
  return (
    <div className="page stack xl">
      <section className="beat-hero fade-up">
        <div className="backdrop" aria-hidden><ArtworkSvg seed={beat.artSeed} hue={beat.hue} /></div>
        <div className="beat-hero-grid">
          <Artwork seed={beat.artSeed} hue={beat.hue} radius={22} className="" />
          <div className="stack" style={{ gap: 14 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="eyebrow">{beat.genre}</span>
              {beat.status !== "published" && <StatusBadge status={beat.status} />}
              {beat.exclusiveOnHold && <span className="badge warn">Exclusive in someone's checkout</span>}
            </div>
            <h1 style={{ fontSize: "clamp(2.4rem, 5vw, 4.2rem)" }}>{beat.title}</h1>
            <div className="row wrap text-2" style={{ gap: 16 }}>
              <Link href={`/producers/${beat.producer.slug}`} style={{ fontWeight: 800, color: "var(--text)" }}>{beat.producer.name}</Link>
              <span>{beat.bpm} BPM</span><span>{beat.key}</span>{beat.mood && <span>{beat.mood}</span>}
              <span className="muted">{beat.plays.toLocaleString()} plays</span>
            </div>
            <BeatHeroPlayer beat={beat} />
          </div>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr)", gap: 22 }}>
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div><div className="eyebrow">Licensing</div><h2 style={{ marginTop: 8 }}>Choose your license</h2></div>
        </div>
        <LicensePicker beat={beat} signedIn={!!actor} />
      </section>

      {beat.description && (
        <section className="card flat"><h3>About this beat</h3><p className="text-2" style={{ marginTop: 8 }}>{beat.description}</p></section>
      )}

      {more.length > 0 && (
        <section>
          <div className="section-head"><h2>More from {beat.producer.name}</h2><Link href={`/producers/${beat.producer.slug}`} className="btn btn-sm">Storefront</Link></div>
          <div className="grid cols-4">{more.map((b, i) => <BeatCard key={b.id} beat={b} queue={more} index={i} />)}</div>
        </section>
      )}
    </div>
  );
}
