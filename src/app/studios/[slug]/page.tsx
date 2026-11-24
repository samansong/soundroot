import { notFound } from "next/navigation";
import { getStudioPublic } from "@/server/modules/studio";
import { getActor } from "@/server/session";
import { ArtworkSvg } from "@/components/Artwork";
import { IconPin } from "@/components/icons";
import { money } from "@/lib/format";
import { BookingWidget } from "./BookingWidget";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try { return { title: getStudioPublic((await params).slug).name }; } catch { return { title: "Studio" }; }
}

export default async function StudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let s;
  try { s = getStudioPublic(slug); } catch { notFound(); }
  const actor = await getActor();
  return (
    <div className="page stack xl">
      <section className="beat-hero fade-up" style={{ minHeight: 280, display: "grid", alignContent: "end" }}>
        <div className="backdrop" aria-hidden style={{ opacity: 0.7 }}><ArtworkSvg seed={s.name.length * 13} hue={s.hue} variant={1} /></div>
        <div className="eyebrow">Studio</div>
        <h1 style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", marginTop: 8 }}>{s.name}</h1>
        <div className="row wrap text-2" style={{ marginTop: 10, gap: 16 }}>
          <span className="row" style={{ gap: 6 }}><IconPin width={16} />{s.address}</span>
          <span>Open {s.openHour}:00–{s.closeHour}:00 ({s.timezone})</span>
          <span>{s.depositPct}% deposit to confirm</span>
        </div>
      </section>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 440px)", gap: 24, alignItems: "start" }}>
        <div className="stack lg">
          <div className="card flat stack">
            <h3>About</h3>
            <p className="text-2">{s.description}</p>
          </div>
          <div className="stack">
            <h3>Services & rates</h3>
            {s.services.map((v: any) => (
              <div key={v.id} className="card flat tight row between">
                <div><b>{v.name}</b><div className="muted small">{v.description} · {v.duration_min / 60}h</div></div>
                <b className="gold">{money(v.rate_minor)}</b>
              </div>
            ))}
          </div>
          <div className="grid cols-2">
            <div className="card flat stack">
              <h3>Rooms</h3>
              {s.rooms.map((r: any) => <div key={r.id}><b>{r.name}</b><div className="muted small">{r.description || `Up to ${r.capacity} people`}</div></div>)}
            </div>
            <div className="card flat stack">
              <h3>Engineers</h3>
              {s.engineers.map((e: any) => <div key={e.id} className="text-2">{e.name}</div>)}
            </div>
          </div>
          <div className="card flat stack"><h3>Cancellation policy</h3><p className="text-2 small">{s.cancellationPolicy}</p></div>
        </div>
        <BookingWidget studio={s} signedIn={!!actor} />
      </div>
    </div>
  );
}
