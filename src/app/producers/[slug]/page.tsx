import { notFound } from "next/navigation";
import { producerBySlug, searchBeats } from "@/server/modules/catalog";
import { ArtworkSvg } from "@/components/Artwork";
import { BeatRow } from "@/components/beats";
import { IconPin } from "@/components/icons";
import { Avatar } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try { return { title: producerBySlug((await params).slug).display_name }; } catch { return { title: "Producer" }; }
}

export default async function ProducerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let p;
  try { p = producerBySlug(slug); } catch { notFound(); }
  const beats = searchBeats({ producer: slug, pageSize: 48, sort: "popular" }).items;
  return (
    <div className="page stack xl">
      <section className="beat-hero fade-up">
        <div className="backdrop" aria-hidden style={{ opacity: 0.6 }}><ArtworkSvg seed={p.display_name.length * 101} hue={p.hue} variant={3} /></div>
        <div className="row wrap" style={{ gap: 24, alignItems: "end" }}>
          <Avatar name={p.display_name} hue={p.hue} size={120} />
          <div className="stack" style={{ gap: 8 }}>
            <div className="eyebrow">Producer</div>
            <h1 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}>{p.display_name}</h1>
            <div className="row wrap text-2" style={{ gap: 16 }}>
              {p.city && <span className="row" style={{ gap: 6 }}><IconPin width={16} />{p.city}</span>}
              <span>{p.stats.beats} beats</span><span>{Number(p.stats.plays).toLocaleString()} plays</span>
            </div>
            {p.bio && <p className="text-2" style={{ maxWidth: 620 }}>{p.bio}</p>}
          </div>
        </div>
      </section>
      <section className="stack" style={{ gap: 4 }}>
        <h2 style={{ marginBottom: 12 }}>Catalog</h2>
        {beats.map((b, i) => <BeatRow key={b.id} beat={b} queue={beats} index={i} />)}
        {beats.length === 0 && <div className="empty">No published beats yet.</div>}
      </section>
    </div>
  );
}
