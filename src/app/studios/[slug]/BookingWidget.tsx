"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, money, useAsync } from "@/components/ui";

interface Studio { id: string; name: string; slug: string; timezone: string; depositPct: number; rooms: { id: string; name: string }[]; services: { id: string; name: string; duration_min: number; rate_minor: number }[]; engineers: { id: string; name: string }[] }
interface Slot { startsAt: string; label: string; roomIds: string[] }

function ymd(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function BookingWidget({ studio, signedIn }: { studio: Studio; signedIn: boolean }) {
  const router = useRouter();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => new Date(Date.now() + i * 86400_000)), []);
  const [serviceId, setServiceId] = useState(studio.services[0]?.id);
  const [date, setDate] = useState(ymd(days[0], studio.timezone));
  const [engineerId, setEngineerId] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const { busy, run } = useAsync();
  const svc = studio.services.find((s) => s.id === serviceId);

  useEffect(() => {
    if (!serviceId) return;
    setSlots(null); setSlot(null);
    const qs = new URLSearchParams({ date, serviceId, ...(engineerId ? { engineerId } : {}) });
    api<{ slots: Slot[] }>(`/api/v1/studios/${studio.id}/availability?${qs}`).then((r) => setSlots(r.slots)).catch(() => setSlots([]));
  }, [date, serviceId, engineerId, studio.id]);

  const book = () => run(async () => {
    if (!signedIn) { router.push(`/login?next=/studios/${studio.slug}`); return; }
    const r = await api<{ orderId: string }>("/api/v1/bookings", { method: "POST", json: { studioId: studio.id, serviceId, roomId: roomId || slot!.roomIds[0], startsAt: slot!.startsAt, engineerId: engineerId || null, notes } });
    const c = await api<{ checkoutUrl: string }>("/api/v1/payments/checkout", { method: "POST", json: { orderId: r.orderId, idempotencyKey: crypto.randomUUID() } });
    router.push(c.checkoutUrl);
  });

  const deposit = svc ? Math.round((svc.rate_minor * studio.depositPct) / 100) : 0;
  return (
    <div className="card stack lg" style={{ position: "sticky", top: 90 }}>
      <div><div className="eyebrow">Book a session</div><h3 style={{ marginTop: 6 }}>Pick a time</h3></div>
      <label className="label">Service
        <select className="select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {studio.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.rate_minor)} · {s.duration_min / 60}h</option>)}
        </select>
      </label>
      <div className="date-strip" role="listbox" aria-label="Date">
        {days.map((d) => {
          const v = ymd(d, studio.timezone);
          return (
            <button key={v} className={`date-pill ${date === v ? "on" : ""}`} onClick={() => setDate(v)} role="option" aria-selected={date === v}>
              <span>{d.toLocaleDateString("en-GB", { weekday: "short", timeZone: studio.timezone })}</span>
              <b>{d.toLocaleDateString("en-GB", { day: "numeric", timeZone: studio.timezone })}</b>
              <span>{d.toLocaleDateString("en-GB", { month: "short", timeZone: studio.timezone })}</span>
            </button>
          );
        })}
      </div>
      <label className="label">Engineer <span className="hint">optional</span>
        <select className="select" value={engineerId} onChange={(e) => setEngineerId(e.target.value)}>
          <option value="">Any available engineer</option>
          {studio.engineers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <div className="stack" style={{ gap: 8 }}>
        <span className="label">Available start times <span className="hint">({studio.timezone})</span></span>
        {slots === null ? <div className="muted small">Checking the calendar…</div> : slots.length === 0 ? <div className="muted small">Fully booked — try another day.</div> : (
          <div className="slot-grid">
            {slots.map((s) => <button key={s.startsAt} className={`slot ${slot?.startsAt === s.startsAt ? "on" : ""}`} onClick={() => { setSlot(s); setRoomId(s.roomIds[0]); }}>{s.label}</button>)}
          </div>
        )}
      </div>
      {slot && slot.roomIds.length > 1 && (
        <label className="label">Room
          <select className="select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {slot.roomIds.map((id) => <option key={id} value={id}>{studio.rooms.find((r) => r.id === id)?.name}</option>)}
          </select>
        </label>
      )}
      {slot && <label className="label">Notes for the studio <span className="hint">optional</span><textarea className="textarea" style={{ minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="References, number of vocalists, gear requests…" /></label>}
      {svc && (
        <div className="glass" style={{ padding: 14, display: "grid", gap: 6 }}>
          <div className="row between small"><span className="muted">Session</span><span>{money(svc.rate_minor)}</span></div>
          <div className="row between"><b>Deposit due now ({studio.depositPct}%)</b><b className="gold">{money(deposit)}</b></div>
          <div className="xs muted">Balance paid at the studio. Your slot is held for 15 minutes while you pay.</div>
        </div>
      )}
      <button className="btn btn-primary btn-lg" disabled={!slot || busy} onClick={book}>{busy ? "Holding your slot…" : slot ? `Hold ${slot.label} & pay deposit` : "Choose a time"}</button>
    </div>
  );
}
