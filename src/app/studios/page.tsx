import Link from "next/link";
import { listStudios } from "@/server/modules/studio";
import { ArtworkSvg } from "@/components/Artwork";
import { IconPin } from "@/components/icons";

export const metadata = { title: "Find studios" };

export default async function StudiosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const studios = listStudios(q);
  return (
    <div className="page stack lg">
      <header className="fade-up">
        <div className="eyebrow">Studios</div>
        <h1 style={{ marginTop: 10 }}>Book a room. Bring the vibe.</h1>
        <p className="text-2" style={{ marginTop: 8 }}>Live availability, transparent rates and deposits you can pay with MoMo.</p>
      </header>
      <form className="row" style={{ maxWidth: 460 }}>
        <input className="input" name="q" defaultValue={q} placeholder="Search by name or city" style={{ borderRadius: 999 }} aria-label="Search studios" />
        <button className="btn">Search</button>
      </form>
      <div className="grid cols-3">
        {studios.map((s, i) => (
          <Link key={s.id} href={`/studios/${s.slug}`} className="card studio-card fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="studio-cover"><ArtworkSvg seed={i * 31 + 7} hue={s.hue} variant={i % 2 ? 2 : 1} /></div>
            <div className="studio-body">
              <div className="row between"><h3>{s.name}</h3>{s.from_hourly_minor && <span className="gold small" style={{ fontWeight: 800 }}>from GHS {Math.round(s.from_hourly_minor / 100)}/h</span>}</div>
              <span className="muted small row" style={{ gap: 6 }}><IconPin width={14} />{s.city} · {s.rooms} room{s.rooms === 1 ? "" : "s"}</span>
              <span className="text-2 small">{s.tagline}</span>
              {s.services && <div className="tags" style={{ marginTop: 4 }}>{String(s.services).split(" · ").map((x: string) => <span key={x} className="tag">{x}</span>)}</div>}
            </div>
          </Link>
        ))}
        {studios.length === 0 && <div className="empty">No studios found.</div>}
      </div>
    </div>
  );
}
