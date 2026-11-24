"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconDownload, IconPlus } from "@/components/icons";
import { api, Avatar, Modal, money, StatusBadge, Tabs, useAsync, useToast } from "@/components/ui";

type TabKey = "overview" | "calendar" | "clients" | "projects" | "payments" | "team" | "settings";
interface Props { studios: { id: string; name: string; role: string }[]; studioId: string; role: string; canFinance: boolean; initialTab?: string; me: string }

const today = (tz = "Africa/Accra") => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function StudioWorkspace({ studios, studioId, role, canFinance, initialTab, me }: Props) {
  const router = useRouter();
  const manager = role !== "engineer";
  const tabs: { value: TabKey; label: string }[] = [
    { value: "overview", label: "Overview" }, { value: "calendar", label: "Calendar" },
    ...(manager ? [{ value: "clients" as const, label: "Clients" }] : []),
    { value: "projects", label: "Projects" },
    ...(canFinance ? [{ value: "payments" as const, label: "Payments" }] : []),
    ...(manager ? [{ value: "team" as const, label: "Team" }, { value: "settings" as const, label: "Settings" }] : []),
  ];
  const [tab, setTab] = useState<TabKey>((tabs.find((t) => t.value === initialTab)?.value ?? "overview") as TabKey);
  const [ws, setWs] = useState<any>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [newBooking, setNewBooking] = useState(false);
  const load = useCallback(() => api(`/api/v1/studio/${studioId}`).then(setWs), [studioId]);
  useEffect(() => { void load(); }, [load]);
  const go = (t: TabKey) => { setTab(t); router.replace(`/studio?s=${studioId}&tab=${t}`, { scroll: false }); };

  if (!ws) return <div className="muted">Loading workspace…</div>;
  const s = ws.studio;
  return (
    <div className="stack lg">
      <header className="row between wrap">
        <div>
          <div className="eyebrow">Studio workspace · {role}</div>
          <h1 style={{ marginTop: 10 }}>{tab === "overview" ? "Studio overview" : tabs.find((t) => t.value === tab)?.label}</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            {studios.length > 1 ? (
              <select className="select" style={{ width: "auto", height: 32, display: "inline-block" }} value={studioId} onChange={(e) => router.push(`/studio?s=${e.target.value}`)} aria-label="Studio">
                {studios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            ) : s.name}{" "}/ {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: s.timezone })}
          </div>
        </div>
        <div className="row">
          <Link href={`/studios/${s.slug}`} className="btn btn-sm btn-ghost">Public booking page ↗</Link>
          {manager && <button className="btn btn-teal" onClick={() => setNewBooking(true)}><IconPlus />New booking</button>}
        </div>
      </header>
      <Tabs value={tab} onChange={go} items={tabs} />

      {tab === "overview" && <Overview ws={ws} open={setBookingId} />}
      {tab === "calendar" && <Calendar studioId={studioId} open={setBookingId} />}
      {tab === "clients" && <Clients studioId={studioId} canFinance={canFinance} />}
      {tab === "projects" && <Projects studioId={studioId} manager={manager} />}
      {tab === "payments" && <Payments studioId={studioId} services={s.services} />}
      {tab === "team" && <Team studioId={studioId} isOwner={role === "owner"} me={me} />}
      {tab === "settings" && <Settings studio={s} studioId={studioId} reload={load} />}

      <BookingModal id={bookingId} onClose={() => setBookingId(null)} studio={s} manager={manager} canFinance={canFinance} reload={load} />
      <NewBookingModal open={newBooking} onClose={() => setNewBooking(false)} studio={s} studioId={studioId} reload={load} />
    </div>
  );
}

function bookingStatus(b: any) {
  if (b.status === "held") return <span className="badge warn">Awaiting deposit</span>;
  if (b.status === "confirmed" && b.paid_minor != null && b.paid_minor < b.quoted_minor && b.paid_minor === 0) return <span className="badge warn">Deposit due</span>;
  if (b.status === "confirmed" && b.paid_minor != null && b.paid_minor < b.quoted_minor) return <span className="badge info">Balance due</span>;
  return <StatusBadge status={b.status} />;
}

function Overview({ ws, open }: { ws: any; open: (id: string) => void }) {
  const max = Math.max(1, ...(ws.revenue7 ?? []).map((d: any) => d.collectedMinor));
  return (
    <div className="stack lg">
      <div className="grid cols-3">
        <div className="card stat"><div className="label-sm">Bookings today</div><div className="value">{ws.stats.bookingsToday}</div></div>
        <div className="card stat"><div className="label-sm">Collected (7 days)</div><div className="value gold">{ws.stats.collectedWeekMinor == null ? "Restricted" : money(ws.stats.collectedWeekMinor)}</div><div className="delta muted">actual payments received — not bookings</div></div>
        <div className="card stat"><div className="label-sm">Open projects</div><div className="value">{ws.stats.openProjects}</div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)", gap: 18 }}>
        <div className="card stack">
          <h3>Upcoming sessions</h3>
          {ws.upcoming.length === 0 && <div className="muted small">Nothing scheduled.</div>}
          {ws.upcoming.map((b: any) => (
            <button key={b.id} className="row card flat tight" style={{ textAlign: "left", cursor: "pointer", gap: 16 }} onClick={() => open(b.id)}>
              <div style={{ width: 64 }}><b style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{b.local_time}</b><div className="xs muted">{b.local_date.slice(5)}</div></div>
              <div className="grow" style={{ minWidth: 0 }}><b>{b.client_name ?? "Client"}</b> <span className="text-2">/ {b.service_name}</span><div className="xs muted truncate">{b.room_name}{b.engineer_name ? ` · ${b.engineer_name}` : ""}</div></div>
              {bookingStatus(b)}
            </button>
          ))}
        </div>
        <div className="card stack">
          <h3>Revenue this week</h3>
          {ws.revenue7 ? (
            <>
              <div className="bars" role="img" aria-label="Collected revenue per day for the last 7 days">
                {ws.revenue7.map((d: any, i: number) => (
                  <div key={d.day} className="bar" title={`${d.day}: ${money(d.collectedMinor)}`}>
                    <span className="xs" style={{ color: "var(--text-2)" }}>{d.collectedMinor ? Math.round(d.collectedMinor / 100) : ""}</span>
                    <i style={{ height: `${Math.max(3, (d.collectedMinor / max) * 120)}px`, animationDelay: `${i * 70}ms` }} />
                    <span>{new Date(d.day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short" })}</span>
                  </div>
                ))}
              </div>
              <span className="xs muted">GHS collected per day (deposits, balances, walk-in cash). Unconfirmed bookings are excluded.</span>
            </>
          ) : <div className="notice warn">Financial records are restricted for your role.</div>}
        </div>
      </div>
    </div>
  );
}

function Calendar({ studioId, open }: { studioId: string; open: (id: string) => void }) {
  const [from, setFrom] = useState(today());
  const [mode, setMode] = useState<"rooms" | "week">("week");
  const [data, setData] = useState<any>(null);
  useEffect(() => { api(`/api/v1/studio/${studioId}/calendar?from=${from}&days=7`).then(setData); }, [studioId, from]);
  if (!data) return <div className="muted">Loading calendar…</div>;
  const hours = Array.from({ length: data.closeHour - data.openHour }, (_, i) => data.openHour + i);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(from + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const cols = mode === "week" ? days.map((d) => ({ key: d, label: new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }) })) : data.rooms.map((r: any) => ({ key: r.id, label: r.name }));
  const H = 52;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const shift = (n: number) => { const d = new Date(from + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); setFrom(d.toISOString().slice(0, 10)); };
  const nowMin = (() => { const t = new Intl.DateTimeFormat("en-GB", { timeZone: data.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); return toMin(t); })();
  return (
    <div className="stack">
      <div className="row wrap between">
        <div className="row">
          <button className="btn btn-sm" onClick={() => shift(mode === "week" ? -7 : -1)}>←</button>
          <button className="btn btn-sm" onClick={() => setFrom(today(data.timezone))}>Today</button>
          <button className="btn btn-sm" onClick={() => shift(mode === "week" ? 7 : 1)}>→</button>
          <b style={{ marginLeft: 8 }}>{mode === "week" ? `Week of ${new Date(from + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : new Date(from + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</b>
        </div>
        <Tabs value={mode} onChange={setMode} items={[{ value: "week", label: "Week" }, { value: "rooms", label: "Rooms (day)" }]} />
      </div>
      <div className="table-wrap">
        <div className="cal" style={{ minWidth: 720 }}>
          <div className="cal-head" style={{ gridTemplateColumns: `56px repeat(${cols.length}, 1fr)` }}>
            <div style={{ borderLeft: "none" }} />
            {cols.map((c: any) => <div key={c.key}>{c.label}</div>)}
          </div>
          <div className="cal-body" style={{ gridTemplateColumns: `56px repeat(${cols.length}, 1fr)` }}>
            <div>{hours.map((h) => <div key={h} className="cal-hour">{String(h).padStart(2, "0")}:00</div>)}</div>
            {cols.map((c: any) => {
              const evs = data.bookings.filter((b: any) => (mode === "week" ? b.local_date === c.key : b.room_id === c.key && b.local_date === from));
              const isToday = mode === "week" ? c.key === today(data.timezone) : from === today(data.timezone);
              return (
                <div key={c.key} className="cal-col" style={{ height: hours.length * H }}>
                  {hours.map((h) => <div key={h} style={{ height: H, borderTop: "1px solid var(--line)" }} />)}
                  {isToday && nowMin > data.openHour * 60 && nowMin < data.closeHour * 60 && <div className="cal-now" style={{ top: ((nowMin - data.openHour * 60) / 60) * H }} />}
                  {evs.map((b: any) => {
                    const top = ((toMin(b.local_start) - data.openHour * 60) / 60) * H;
                    const height = Math.max(26, ((toMin(b.local_end) - toMin(b.local_start)) / 60) * H - 4);
                    const hue = b.status === "held" ? 40 : b.source === "manual" ? 268 : 168;
                    return (
                      <div key={b.id} className="cal-ev" role="button" tabIndex={0} onClick={() => open(b.id)} onKeyDown={(e) => e.key === "Enter" && open(b.id)}
                        style={{ top, height, background: `linear-gradient(160deg, hsl(${hue} 60% 40% / .85), hsl(${hue} 60% 25% / .85))`, opacity: b.status === "completed" ? 0.55 : 1 }}>
                        <b>{b.local_start} {b.client_name ?? ""}</b>
                        <span>{b.service_name}{mode === "week" ? ` · ${b.room_name}` : ""}</span>
                        {b.engineer_name && <div className="xs" style={{ opacity: 0.8 }}>{b.engineer_name}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="row wrap xs muted" style={{ gap: 16 }}>
        <span><span className="badge info plain" style={{ background: "hsl(168 60% 35%)", color: "white" }}>Platform</span> booked on SoundRoot</span>
        <span><span className="badge plain" style={{ background: "hsl(268 60% 35%)", color: "white" }}>Manual</span> walk-in / your client (0% commission)</span>
        <span><span className="badge plain" style={{ background: "hsl(40 60% 35%)", color: "white" }}>Held</span> awaiting deposit</span>
      </div>
    </div>
  );
}

function BookingModal({ id, onClose, studio, manager, canFinance, reload }: { id: string | null; onClose: () => void; studio: any; manager: boolean; canFinance: boolean; reload: () => void }) {
  const [d, setD] = useState<any>(null);
  const [resched, setResched] = useState("");
  const [amount, setAmount] = useState("");
  const { busy, run } = useAsync();
  const load = useCallback(() => id && api(`/api/v1/bookings/${id}`).then(setD), [id]);
  useEffect(() => { setD(null); void load(); }, [load]);
  if (!id) return null;
  const act = (json: any, ok: string) => run(async () => { await api(`/api/v1/bookings/${id}`, { method: "PATCH", json }); await load(); reload(); }, ok);
  const b = d?.booking;
  const tzFmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: studio.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <Modal open onClose={onClose} title="Booking details" width={620}>
      {!d ? <div className="muted">Loading…</div> : (
        <div className="stack lg">
          <div className="row between wrap">
            <div><b style={{ fontSize: "1.1rem" }}>{tzFmt(b.starts_at)} – {new Date(b.ends_at).toLocaleTimeString("en-GB", { timeZone: studio.timezone, hour: "2-digit", minute: "2-digit" })}</b>
              <div className="muted small">{studio.services.find((s: any) => s.id === b.service_id)?.name} · {studio.rooms.find((r: any) => r.id === b.room_id)?.name} · {b.source === "manual" ? "Manual booking" : "Booked on SoundRoot"}</div></div>
            {bookingStatus(b)}
          </div>
          {b.notes && <div className="notice info small">“{b.notes}”</div>}
          {canFinance && b.quoted_minor != null && (
            <div className="grid cols-3">
              <div className="card flat tight"><div className="xs muted">Quoted</div><b>{money(b.quoted_minor)}</b></div>
              <div className="card flat tight"><div className="xs muted">Deposit</div><b>{money(b.deposit_minor)}</b></div>
              <div className="card flat tight"><div className="xs muted">Collected</div><b className={b.paid_minor >= b.quoted_minor ? "teal" : "gold"}>{money(b.paid_minor)}</b></div>
            </div>
          )}
          {d.client && (
            <div className="card flat tight stack" style={{ gap: 6 }}>
              <div className="row between"><b>{d.client.name}</b><span className="xs muted">{d.client.phone ?? ""} {d.client.email ?? ""}</span></div>
              {d.client.private_notes && <div className="small" style={{ color: "#ffe2a6" }}>🔒 {d.client.private_notes}</div>}
              {d.history.length > 0 && <div className="xs muted">History: {d.history.map((h: any) => `${new Date(h.starts_at).toLocaleDateString("en-GB")} ${h.service_name} (${h.status})`).join(" · ")}</div>}
            </div>
          )}
          {manager && ["held", "confirmed"].includes(b.status) && (
            <div className="stack">
              <div className="row wrap">
                <input className="input" type="datetime-local" value={resched} onChange={(e) => setResched(e.target.value)} style={{ width: 230 }} aria-label="New start time" />
                <button className="btn btn-sm" disabled={!resched || busy} onClick={() => act({ action: "reschedule", startsAt: new Date(resched + ":00Z").toISOString() }, "Rescheduled")}>Reschedule</button>
                <select className="select" style={{ width: 200 }} value={b.engineer_user_id ?? ""} onChange={(e) => act({ action: "assign", engineerId: e.target.value || null }, "Engineer assigned")} aria-label="Engineer">
                  <option value="">No engineer</option>
                  {studio.engineers.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              {canFinance && b.status === "confirmed" && b.paid_minor < b.quoted_minor && (
                <div className="row">
                  <input className="input" type="number" min={1} placeholder="Amount GHS" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 160 }} />
                  <button className="btn btn-sm" disabled={!amount || busy} onClick={() => act({ action: "record_payment", amountMajor: Number(amount) }, "Payment recorded (audited)")}>Record cash payment</button>
                </div>
              )}
              <div className="row">
                {b.status === "confirmed" && <button className="btn btn-sm btn-teal" disabled={busy} onClick={() => act({ action: "complete" }, "Marked complete")}>Mark complete</button>}
                <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => confirm("Cancel this booking? The client will be notified.") && act({ action: "cancel" }, "Booking cancelled")}>Cancel booking</button>
              </div>
              <span className="xs muted">Times are in {studio.timezone}. Rescheduling is collision-checked against room and engineer calendars.</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function NewBookingModal({ open, onClose, studio, studioId, reload }: { open: boolean; onClose: () => void; studio: any; studioId: string; reload: () => void }) {
  const [clients, setClients] = useState<any[]>([]);
  const [f, setF] = useState({ serviceId: studio.services[0]?.id, roomId: studio.rooms[0]?.id, engineerId: "", date: today(studio.timezone), time: "14:00", clientId: "", clientName: "", clientPhone: "", paidMajor: "", notes: "" });
  const { busy, run } = useAsync();
  useEffect(() => { if (open) api(`/api/v1/studio/${studioId}/clients`).then(setClients); }, [open, studioId]);
  const submit = () => run(async () => {
    // Africa/Accra is UTC+0; for other zones the server validates against studio hours.
    const startsAt = new Date(`${f.date}T${f.time}:00Z`).toISOString();
    await api(`/api/v1/studio/${studioId}/bookings`, { method: "POST", json: { serviceId: f.serviceId, roomId: f.roomId, engineerId: f.engineerId || null, startsAt, clientId: f.clientId || undefined, clientName: f.clientName || undefined, clientPhone: f.clientPhone || undefined, paidMajor: Number(f.paidMajor) || 0, notes: f.notes } });
    onClose(); reload();
  }, "Booking added");
  return (
    <Modal open={open} onClose={onClose} title="New manual booking">
      <div className="stack">
        <div className="notice info small">Walk-ins and your own clients — no platform commission.</div>
        <div className="field-row">
          <label className="label">Service<select className="select" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>{studio.services.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="label">Room<select className="select" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>{studio.rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        </div>
        <div className="field-row">
          <label className="label">Date<input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="label">Start<input className="input" type="time" step={1800} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
          <label className="label">Engineer<select className="select" value={f.engineerId} onChange={(e) => setF({ ...f, engineerId: e.target.value })}><option value="">—</option>{studio.engineers.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>
        <label className="label">Client<select className="select" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">+ New client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        {!f.clientId && <div className="field-row"><label className="label">Client name<input className="input" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} /></label><label className="label">Phone<input className="input" value={f.clientPhone} onChange={(e) => setF({ ...f, clientPhone: e.target.value })} /></label></div>}
        <label className="label">Paid now (GHS) <span className="hint">cash / MoMo received at the desk</span><input className="input" type="number" min={0} value={f.paidMajor} onChange={(e) => setF({ ...f, paidMajor: e.target.value })} /></label>
        <button className="btn btn-teal" disabled={busy} onClick={submit}>Add booking</button>
      </div>
    </Modal>
  );
}

function Clients({ studioId, canFinance }: { studioId: string; canFinance: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [q, setQ] = useState("");
  const { busy, run } = useAsync();
  const load = useCallback(() => api(`/api/v1/studio/${studioId}/clients`).then(setRows), [studioId]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => (rows ?? []).filter((r) => r.name.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  return (
    <div className="stack">
      <div className="row wrap">
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grow" />
        <a className="btn btn-sm" href={`/api/v1/studio/${studioId}/clients?format=csv`}><IconDownload />Export CSV</a>
        <button className="btn btn-sm btn-teal" onClick={() => setEdit({ name: "", email: "", phone: "", privateNotes: "" })}><IconPlus />Add client</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Client</th><th>Contact</th><th>Bookings</th><th>Projects</th><th>Last session</th>{canFinance && <th>Balance</th>}<th></th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td><div className="row"><Avatar name={c.name} hue={(c.name.charCodeAt(0) * 37) % 360} /><div><b>{c.name}</b>{c.user_id && <div className="xs teal">On SoundRoot</div>}</div></div></td>
                <td className="small text-2">{c.email ?? ""}<div>{c.phone ?? ""}</div></td>
                <td>{c.bookings}</td><td>{c.projects}</td>
                <td className="small">{c.last_session ? new Date(c.last_session).toLocaleDateString("en-GB") : "—"}</td>
                {canFinance && <td className={c.balance > 0 ? "gold" : "muted"} style={{ fontWeight: 700 }}>{money(c.balance)}</td>}
                <td style={{ textAlign: "right" }}><button className="btn btn-sm btn-ghost" onClick={() => setEdit({ id: c.id, name: c.name, email: c.email ?? "", phone: c.phone ?? "", privateNotes: c.private_notes })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit client" : "Add client"}>
        {edit && (
          <div className="stack">
            <label className="label">Name<input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <div className="field-row">
              <label className="label">Email<input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
              <label className="label">Phone<input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            </div>
            <label className="label">🔒 Private studio notes <span className="hint">never visible to the client</span><textarea className="textarea" value={edit.privateNotes} onChange={(e) => setEdit({ ...edit, privateNotes: e.target.value })} /></label>
            <button className="btn btn-teal" disabled={busy} onClick={() => run(async () => { await api(`/api/v1/studio/${studioId}/clients`, { method: "POST", json: edit }); setEdit(null); await load(); }, "Client saved")}>Save</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Projects({ studioId, manager }: { studioId: string; manager: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [f, setF] = useState({ title: "", clientId: "", engineerId: "", priceMajor: "", dueDate: "", revisionAllowance: "2", deliverables: "Mixed & mastered WAV, instrumental, stems" });
  const { busy, run } = useAsync();
  const router = useRouter();
  const load = useCallback(() => api<any[]>("/api/v1/projects").then((r) => setRows(r)), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    api(`/api/v1/studio/${studioId}/clients`).then(setClients);
    api(`/api/v1/studio/${studioId}/team`).then((t) => setTeam(t.members.filter((m: any) => !m.revoked_at)));
  }, [open, studioId]);
  return (
    <div className="stack">
      {manager && <button className="btn btn-teal" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}><IconPlus />New project</button>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Project</th><th>Client</th><th>Engineer</th><th>Due</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>
            {(rows ?? []).map((p) => (
              <tr key={p.id} className="clickable" onClick={() => router.push(`/projects/${p.id}`)}>
                <td><b>{p.title}</b><div className="xs muted">{p.versions} versions · rev {p.revisions_used}/{p.revision_allowance}</div></td>
                <td>{p.client_name}</td><td>{p.engineer_name ?? "—"}</td>
                <td className="small">{p.due_date ?? "—"}</td>
                <td className="small">{money(p.paid_minor)} / {money(p.price_minor)}</td>
                <td><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="New project">
        <div className="stack">
          <label className="label">Title<input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <div className="field-row">
            <label className="label">Client<select className="select" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.user_id ? "" : " (offline)"}</option>)}</select></label>
            <label className="label">Engineer<select className="select" value={f.engineerId} onChange={(e) => setF({ ...f, engineerId: e.target.value })}><option value="">—</option>{team.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></label>
          </div>
          <div className="field-row">
            <label className="label">Price (GHS)<input className="input" type="number" min={0} value={f.priceMajor} onChange={(e) => setF({ ...f, priceMajor: e.target.value })} /></label>
            <label className="label">Due date<input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
            <label className="label">Revisions<input className="input" type="number" min={0} max={20} value={f.revisionAllowance} onChange={(e) => setF({ ...f, revisionAllowance: e.target.value })} /></label>
          </div>
          <label className="label">Deliverables<textarea className="textarea" value={f.deliverables} onChange={(e) => setF({ ...f, deliverables: e.target.value })} /></label>
          <span className="xs muted">Clients with a SoundRoot account are added as project members so they can review and approve.</span>
          <button className="btn btn-teal" disabled={busy || !f.title || !f.clientId} onClick={() => run(async () => {
            const r = await api<{ id: string }>("/api/v1/projects", { method: "POST", json: { studioId, title: f.title, clientId: f.clientId, engineerId: f.engineerId || null, priceMajor: Number(f.priceMajor) || 0, dueDate: f.dueDate || null, revisionAllowance: Number(f.revisionAllowance), deliverables: f.deliverables } });
            router.push(`/projects/${r.id}`);
          }, "Project created")}>Create project</button>
        </div>
      </Modal>
    </div>
  );
}

function Payments({ studioId, services }: { studioId: string; services: any[] }) {
  const [range, setRange] = useState(() => { const t = today(); const d = new Date(t + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 30); return { from: d.toISOString().slice(0, 10), to: t, serviceId: "" }; });
  const [r, setR] = useState<any>(null);
  const [exp, setExp] = useState({ description: "", amountMajor: "", spentOn: today() });
  const { busy, run } = useAsync();
  const qs = new URLSearchParams(range).toString();
  const load = useCallback(() => api(`/api/v1/studio/${studioId}/reports?${qs}`).then(setR), [studioId, qs]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="stack lg">
      <div className="row wrap">
        <label className="label">From<input className="input" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="label">To<input className="input" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <label className="label">Service<select className="select" value={range.serviceId} onChange={(e) => setRange({ ...range, serviceId: e.target.value })}><option value="">All services</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="grow" />
        <a className="btn btn-sm" style={{ alignSelf: "end" }} href={`/api/v1/studio/${studioId}/reports?${qs}&format=csv`}><IconDownload />Export CSV</a>
      </div>
      {r && (
        <>
          <div className="grid cols-4">
            <div className="card stat"><div className="label-sm">Booking value</div><div className="value">{money(r.summary.bookingValueMinor)}</div><div className="delta muted">quoted, confirmed sessions</div></div>
            <div className="card stat"><div className="label-sm">Collected cash</div><div className="value gold">{money(r.summary.collectedMinor)}</div><div className="delta muted">verified payments received</div></div>
            <div className="card stat"><div className="label-sm">Outstanding</div><div className="value" style={{ color: "var(--clay)" }}>{money(r.summary.outstandingMinor)}</div></div>
            <div className="card stat"><div className="label-sm">Net after fees & expenses</div><div className="value teal">{money(r.summary.netMinor)}</div></div>
          </div>
          <div className="grid cols-3">
            <div className="card flat tight"><div className="xs muted">Deposits collected</div><b>{money(r.summary.depositsMinor)}</b></div>
            <div className="card flat tight"><div className="xs muted">Platform + processing fees</div><b>{money(r.summary.platformFeesMinor)}</b></div>
            <div className="card flat tight"><div className="xs muted">Refunds · Expenses</div><b>{money(r.summary.refundsMinor)} · {money(r.summary.expensesMinor)}</b></div>
          </div>
          <div className="notice info small">{r.summary.commissionNote}</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Client</th><th>Service</th><th>Source</th><th>Value</th><th>Collected</th><th>Status</th></tr></thead>
              <tbody>{r.bookings.map((b: any) => (
                <tr key={b.id}><td className="small">{new Date(b.starts_at).toLocaleDateString("en-GB")}</td><td>{b.client}</td><td className="text-2">{b.service}</td><td><span className={`badge plain ${b.source === "manual" ? "plum" : "info"}`}>{b.source}</span></td><td>{money(b.quoted_minor)}</td><td className={b.paid_minor >= b.quoted_minor ? "teal" : "gold"}>{money(b.paid_minor)}</td><td><StatusBadge status={b.status} /></td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="grid cols-2" style={{ alignItems: "start" }}>
            <div className="card stack">
              <h3>Expenses</h3>
              {r.expenses.map((e: any) => <div key={e.id} className="row between small"><span>{e.spent_on} · {e.description}</span><b>{money(e.amount_minor)}</b></div>)}
              {r.expenses.length === 0 && <span className="muted small">No expenses in range.</span>}
            </div>
            <div className="card stack">
              <h3>Add expense</h3>
              <input className="input" placeholder="Description" value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} />
              <div className="field-row"><input className="input" type="number" placeholder="GHS" value={exp.amountMajor} onChange={(e) => setExp({ ...exp, amountMajor: e.target.value })} /><input className="input" type="date" value={exp.spentOn} onChange={(e) => setExp({ ...exp, spentOn: e.target.value })} /></div>
              <button className="btn btn-sm" disabled={busy || !exp.description || !exp.amountMajor} onClick={() => run(async () => { await api(`/api/v1/studio/${studioId}/expenses`, { method: "POST", json: { ...exp, amountMajor: Number(exp.amountMajor) } }); setExp({ ...exp, description: "", amountMajor: "" }); await load(); }, "Expense recorded")}>Add expense</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Team({ studioId, isOwner, me }: { studioId: string; isOwner: boolean; me: string }) {
  const [t, setT] = useState<any>(null);
  const [inv, setInv] = useState({ email: "", role: "engineer", canViewFinance: false });
  const [link, setLink] = useState<string | null>(null);
  const { busy, run } = useAsync();
  const toast = useToast();
  const load = useCallback(() => api(`/api/v1/studio/${studioId}/team`).then(setT), [studioId]);
  useEffect(() => { void load(); }, [load]);
  const act = (mid: string, action: string, ok: string) => run(async () => { await api(`/api/v1/studio/${studioId}/team/${mid}`, { method: "PATCH", json: { action } }); await load(); }, ok);
  if (!t) return <div className="muted">Loading team…</div>;
  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)", gap: 18, alignItems: "start" }}>
      <div className="stack">
        {t.members.map((m: any) => (
          <div key={m.id} className="card flat tight row" style={{ opacity: m.revoked_at ? 0.5 : 1 }}>
            <Avatar name={m.name} hue={(m.name.charCodeAt(0) * 37) % 360} size={38} />
            <div className="grow"><b>{m.name}</b>{m.user_id === me && <span className="xs muted"> (you)</span>}<div className="xs muted">{m.email}</div></div>
            <span className="badge neutral plain">{m.role}</span>
            {m.role !== "owner" && (m.can_view_finance ? <span className="badge ok">Finance</span> : <span className="badge neutral">No finance</span>)}
            {m.role !== "owner" && (
              <div className="row" style={{ gap: 6 }}>
                {isOwner && !m.revoked_at && <button className="btn btn-sm btn-ghost" onClick={() => act(m.id, m.can_view_finance ? "finance_off" : "finance_on", "Permissions updated")}>{m.can_view_finance ? "Remove finance" : "Grant finance"}</button>}
                {m.revoked_at ? <button className="btn btn-sm" disabled={busy} onClick={() => act(m.id, "restore", "Access restored")}>Restore</button>
                  : <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => confirm(`Revoke ${m.name}'s access immediately?`) && act(m.id, "revoke", "Access revoked")}>Revoke</button>}
              </div>
            )}
          </div>
        ))}
        {t.invites.length > 0 && <div className="small muted">Pending invites: {t.invites.map((i: any) => `${i.email} (${i.role})`).join(", ")}</div>}
      </div>
      <div className="card stack">
        <h3>Invite staff</h3>
        <input className="input" placeholder="engineer@email.com" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
        <select className="select" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}><option value="engineer">Engineer — assigned sessions & projects</option><option value="manager">Manager — bookings, clients, projects</option></select>
        {isOwner && <label className="check"><input type="checkbox" checked={inv.canViewFinance} onChange={(e) => setInv({ ...inv, canViewFinance: e.target.checked })} />Allow access to financial records</label>}
        <button className="btn btn-teal" disabled={busy || !inv.email} onClick={() => run(async () => { const r = await api<{ inviteUrl: string }>(`/api/v1/studio/${studioId}/team`, { method: "POST", json: inv }); setLink(location.origin + r.inviteUrl); await load(); }, "Invite created")}>Create invite link</button>
        {link && (
          <div className="notice ok small stack" style={{ gap: 6 }}>
            <span>Share this link (expires in 72 hours):</span>
            <code className="mono" style={{ wordBreak: "break-all" }}>{link}</code>
            <button className="btn btn-sm" onClick={() => { void navigator.clipboard.writeText(link); toast("Copied", "ok"); }}>Copy</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Settings({ studio, studioId, reload }: { studio: any; studioId: string; reload: () => void }) {
  const [f, setF] = useState({ tagline: studio.tagline, description: studio.description, openHour: studio.openHour, closeHour: studio.closeHour, depositPct: studio.depositPct, cancellationPolicy: studio.cancellationPolicy });
  const [bo, setBo] = useState({ date: today(studio.timezone), reason: "" });
  const { busy, run } = useAsync();
  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="card stack">
        <h3>Public profile & booking rules</h3>
        <label className="label">Tagline<input className="input" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></label>
        <label className="label">Description<textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="field-row">
          <label className="label">Opens<input className="input" type="number" min={0} max={23} value={f.openHour} onChange={(e) => setF({ ...f, openHour: Number(e.target.value) })} /></label>
          <label className="label">Closes<input className="input" type="number" min={1} max={24} value={f.closeHour} onChange={(e) => setF({ ...f, closeHour: Number(e.target.value) })} /></label>
          <label className="label">Deposit %<input className="input" type="number" min={0} max={100} value={f.depositPct} onChange={(e) => setF({ ...f, depositPct: Number(e.target.value) })} /></label>
        </div>
        <label className="label">Cancellation policy<textarea className="textarea" value={f.cancellationPolicy} onChange={(e) => setF({ ...f, cancellationPolicy: e.target.value })} /></label>
        <span className="xs muted">Timezone: {studio.timezone}</span>
        <button className="btn btn-teal" style={{ justifySelf: "start" }} disabled={busy} onClick={() => run(async () => { await api(`/api/v1/studio/${studioId}`, { method: "PATCH", json: f }); reload(); }, "Settings saved")}>Save settings</button>
      </div>
      <div className="card stack">
        <h3>Blackout a day</h3>
        <p className="muted small">Holidays, maintenance or private sessions — removes the day from public availability.</p>
        <input className="input" type="date" value={bo.date} onChange={(e) => setBo({ ...bo, date: e.target.value })} />
        <input className="input" placeholder="Reason (e.g. Independence Day)" value={bo.reason} onChange={(e) => setBo({ ...bo, reason: e.target.value })} />
        <button className="btn btn-sm" style={{ justifySelf: "start" }} disabled={busy} onClick={() => run(async () => { await api(`/api/v1/studio/${studioId}/blackouts`, { method: "POST", json: { startsAt: new Date(bo.date + "T00:00:00Z").toISOString(), endsAt: new Date(bo.date + "T23:59:00Z").toISOString(), reason: bo.reason } }); }, "Blackout added")}>Add blackout</button>
      </div>
    </div>
  );
}
