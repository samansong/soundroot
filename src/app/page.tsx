import Link from "next/link";
import { searchBeats } from "@/server/modules/catalog";
import { listStudios } from "@/server/modules/studio";
import { BeatCard } from "@/components/beats";
import Image from "next/image";
import { HeroPlayer } from "./HeroPlayer";
import { ArtworkSvg } from "@/components/Artwork";
import { IconArrow, IconPin } from "@/components/icons";
import { getActor } from "@/server/session";

export default async function Home() {
  const actor = await getActor();
  const popular = searchBeats({ sort: "popular", pageSize: 8 });
  const fresh = popular.items;
  const studios = listStudios().slice(0, 3);
  const featured = fresh[0];
  const genres = ["Afrobeats", "Amapiano", "Highlife", "Asakaa Drill", "Hiplife", "Gospel", "Afro House", "Afro Soul", "Azonto", "Alté", "Afro-fusion", "Bongo"];
  return (
    <div className="page stack xl">
      <section className="hero-stage fade-up">
        <Image src="/images/hero-listener.jpg" alt="" fill priority sizes="(max-width: 900px) 100vw, 1360px" className="hero-photo" />
        <div className="hero-veil" aria-hidden />
        <div className="hero-copy">
          <div className="glass-chip">Made in Accra · Built for the continent</div>
          <h1 style={{ marginTop: 20 }}>
            Where African<br />music gets <span className="gradient-text">made.</span>
          </h1>
          <p className="lede">
            License beats from independent producers, book a session at a real studio, and get your mixes reviewed and delivered — one place for the whole journey from idea to master.
          </p>
          <div className="row wrap" style={{ marginTop: 30, gap: 12 }}>
            <Link href="/beats" className="btn btn-primary btn-lg">Explore beats <IconArrow /></Link>
            <Link href="/studios" className="btn btn-glass btn-lg">Book a studio</Link>
          </div>
          <div className="glass-pane hero-stats">
            {popular.total > 0 && <span><b className="gold">{popular.total}</b> beats ready to license</span>}
            <span><b className="teal">MoMo</b> & card payments</span>
            <span><b style={{ color: "var(--plum)" }}>0%</b> fees on your own clients</span>
          </div>
        </div>
        {featured && <HeroPlayer beat={featured} />}
      </section>

      <div className="marquee" aria-hidden>
        <div className="marquee-track">{[...genres, ...genres].map((g, i) => <span key={i}>{g}</span>)}</div>
      </div>

      <section className="grid cols-3">
        {[
          { n: "01", t: "Beat commerce", d: "Search by genre, mood, BPM and key. Clear license tiers, instant MoMo checkout, license PDF and secure downloads.", href: "/beats", c: "rgba(242,184,75,.35)" },
          { n: "02", t: "Studio operations", d: "Calendars that can't double-book, deposits, client CRM, staff access and a finance view that counts real cash.", href: actor?.memberships.length ? "/studio" : "/signup", c: "rgba(63,209,179,.35)" },
          { n: "03", t: "Project delivery", d: "Upload mixes, leave timestamped feedback on the waveform, approve a version, and unlock masters once paid.", href: "/projects", c: "rgba(155,123,240,.4)" },
        ].map((p) => (
          <Link key={p.n} href={p.href} className="card pillar" style={{ ["--pc" as any]: p.c }}>
            <div>
              <div className="num">{p.n}</div>
              <h3>{p.t}</h3>
              <p className="text-2" style={{ marginTop: 10 }}>{p.d}</p>
            </div>
            <span className="row small" style={{ fontWeight: 700, marginTop: 18 }}>Open <IconArrow width={16} /></span>
          </Link>
        ))}
      </section>

      <section>
        <div className="section-head">
          <div><div className="eyebrow">Trending this week</div><h2 style={{ marginTop: 8 }}>Find your next sound</h2></div>
          <Link href="/beats" className="btn btn-sm">All beats <IconArrow /></Link>
        </div>
        <div className="grid cols-4">
          {fresh.map((b, i) => <BeatCard key={b.id} beat={b} queue={fresh} index={i} />)}
        </div>
      </section>

      <section>
        <div className="section-head">
          <div><div className="eyebrow">Studios</div><h2 style={{ marginTop: 8 }}>Book a room. Bring the vibe.</h2></div>
          <Link href="/studios" className="btn btn-sm">All studios <IconArrow /></Link>
        </div>
        <div className="grid cols-3">
          {studios.map((s, i) => (
            <Link key={s.id} href={`/studios/${s.slug}`} className="card studio-card">
              <div className="studio-cover"><ArtworkSvg seed={i * 31 + 7} hue={s.hue} variant={i % 2 ? 2 : 1} /></div>
              <div className="studio-body">
                <h3>{s.name}</h3>
                <span className="muted small row" style={{ gap: 6 }}><IconPin width={14} />{s.city}</span>
                <span className="text-2 small">{s.tagline}</span>
              </div>
            </Link>
          ))}
          {!actor?.memberships.length && (
            <Link href="/signup" className="card stack" style={{ justifyContent: "center", alignContent: "center", textAlign: "center", borderStyle: "dashed" }}>
              <div className="eyebrow">For studio owners</div>
              <h3>Run your studio on SoundzRoot</h3>
              <p className="muted small">Bring your existing clients — bookings you enter yourself are never charged commission.</p>
              <span className="btn btn-teal btn-sm" style={{ justifySelf: "center" }}>List your studio</span>
            </Link>
          )}
        </div>
      </section>

      <footer className="muted xs" style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
        SoundzRoot MVP · Sample names, studios and amounts are fictional. A license grants usage rights — never an automatic copyright assignment.
      </footer>
    </div>
  );
}
