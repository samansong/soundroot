"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Actor } from "@/server/auth";
import { IconBag, IconBell, IconChart, IconFolder, IconGrid, IconHome, IconLogout, IconMic, IconSearch, IconShield, IconUser, IconWave, Logo } from "./icons";
import { PlayerBar } from "./PlayerBar";
import { api, Avatar, ToastProvider } from "./ui";
import { Ambient } from "./visuals";

type Notif = { id: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };

export function Shell({ actor, children }: { actor: Actor | null; children: React.ReactNode }) {
  const path = usePathname();
  // The sandbox payment page is "another website" (the provider's hosted checkout).
  if (path.startsWith("/pay/")) return <ToastProvider>{children}</ToastProvider>;
  const is = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const studio = actor?.memberships.length;
  const nav = [
    { href: "/", label: "Home", icon: IconHome },
    { href: "/beats", label: "Explore beats", icon: IconWave },
    { href: "/studios", label: "Find studios", icon: IconMic },
    ...(actor ? [{ href: "/projects", label: "My projects", icon: IconFolder }, { href: "/library", label: "Library", icon: IconBag }] : []),
  ];
  const work = [
    ...(actor?.roles.includes("beatmaker") ? [{ href: "/producer", label: "Producer studio", icon: IconGrid }] : []),
    ...(studio ? [{ href: "/studio", label: "Studio workspace", icon: IconChart }] : []),
    ...(actor?.roles.includes("admin") ? [{ href: "/admin", label: "Admin", icon: IconShield }] : []),
  ];
  return (
    <ToastProvider>
      <Ambient />
      <div className="shell">
        <aside className="sidebar" aria-label="Primary">
          <Link href="/" className="brand"><Logo />SOUNDROOT</Link>
          {nav.map((n) => <Link key={n.href} href={n.href} className={`nav-link ${is(n.href) ? "active" : ""}`}><n.icon />{n.label}</Link>)}
          {work.length > 0 && <div className="nav-label">Workspace</div>}
          {work.map((n) => <Link key={n.href} href={n.href} className={`nav-link ${is(n.href) ? "active" : ""}`}><n.icon />{n.label}</Link>)}
          <div className="sidebar-foot">
            {!actor && (
              <div className="card flat tight stack" style={{ gap: 10 }}>
                <b style={{ fontFamily: "var(--font-display)" }}>Make it official.</b>
                <span className="muted small">License beats, book sessions and get your mixes delivered.</span>
                <Link href="/signup" className="btn btn-primary btn-sm">Create account</Link>
              </div>
            )}
          </div>
        </aside>
        <div className="main">
          <TopBar actor={actor} />
          {children}
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Mobile">
        {[...nav.slice(0, 4), ...(work[0] ? [work[0]] : actor ? [] : [{ href: "/login", label: "Sign in", icon: IconUser }])].map((n) => (
          <Link key={n.href} href={n.href} className={is(n.href) ? "active" : ""}><n.icon />{n.label.split(" ").slice(-1)[0]}</Link>
        ))}
      </nav>
      <PlayerBar />
    </ToastProvider>
  );
}

function TopBar({ actor }: { actor: Actor | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <header className="topbar">
      <form className="search search-input" role="search" onSubmit={(e) => { e.preventDefault(); router.push(`/beats?q=${encodeURIComponent(q)}`); }}>
        <IconSearch />
        <input className="input" placeholder="Search beats, producers, genres…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search beats" />
      </form>
      <div className="grow" />
      {actor ? (
        <>
          <Notifications />
          <AccountMenu actor={actor} />
        </>
      ) : (
        <div className="row">
          <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Join SoundRoot</Link>
        </div>
      )}
    </header>
  );
}

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);
  return ref;
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; items: Notif[] }>({ unread: 0, items: [] });
  const ref = useClickAway(open, () => setOpen(false));
  const path = usePathname();
  useEffect(() => {
    let alive = true;
    const load = () => api("/api/v1/notifications").then((d) => alive && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [path]);
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="icon-btn" aria-label={`Notifications (${data.unread} unread)`} onClick={() => { setOpen(!open); if (!open && data.unread) api("/api/v1/notifications", { method: "POST" }).then(() => setData((d) => ({ ...d, unread: 0 }))); }}>
        <IconBell />
        {data.unread > 0 && <span className="count">{data.unread}</span>}
      </button>
      {open && (
        <div className="pop">
          <div className="row between" style={{ padding: "6px 10px 10px" }}><b>Notifications</b><span className="xs muted">Email + in-app</span></div>
          {data.items.length === 0 && <div className="muted small" style={{ padding: 14 }}>You're all caught up.</div>}
          {data.items.map((n) => (
            <Link key={n.id} href={n.link ?? "#"} className="pop-item" onClick={() => setOpen(false)}>
              <div className="row top">
                {!n.read_at && <span className="dot" style={{ marginTop: 7 }} />}
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{n.title}</div>
                  {n.body && <div className="muted small">{n.body}</div>}
                  <div className="xs muted">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ actor }: { actor: Actor }) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway(open, () => setOpen(false));
  const router = useRouter();
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="row btn btn-ghost" style={{ padding: "0 6px 0 4px" }} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account menu">
        <Avatar name={actor.name} hue={(actor.name.charCodeAt(0) * 37) % 360} />
        <span className="small" style={{ fontWeight: 700 }}>{actor.name.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="pop" style={{ width: 260 }}>
          <div style={{ padding: "8px 12px 12px" }}>
            <b>{actor.name}</b>
            <div className="muted xs">{actor.email}</div>
            <div className="row wrap" style={{ gap: 4, marginTop: 8 }}>{actor.roles.map((r) => <span key={r} className="badge neutral plain">{r.replace("_", " ")}</span>)}</div>
          </div>
          <div className="divider" />
          <Link className="pop-item" href="/library" onClick={() => setOpen(false)}>Purchases & bookings</Link>
          {!actor.roles.includes("beatmaker") && (
            <button className="pop-item btn-ghost" style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: "none" }} onClick={async () => { await api("/api/v1/me", { method: "POST", json: { role: "beatmaker" } }); router.push("/producer"); router.refresh(); }}>
              Start selling beats
            </button>
          )}
          <a className="pop-item" href="/api/v1/me/export">Export my data</a>
          <button className="pop-item" style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: "none", color: "#ffb0b0" }} onClick={async () => { await api("/api/v1/auth/logout", { method: "POST" }); router.push("/"); router.refresh(); }}>
            <span className="row"><IconLogout width={16} />Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
