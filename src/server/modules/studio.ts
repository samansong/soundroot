// Studio module: setup, availability, collision-safe bookings, CRM, staff, finance (ST-01..ST-06).
import crypto from "node:crypto";
import { queueInviteEmail } from "../email/send.ts";
import { z } from "zod";
import { addMinutes, all, insert, now, one, run, tx, uuid } from "../db.ts";
import { type Actor, loadActor, membershipFor, requireActor, requireStudio } from "../auth.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { audit, notify } from "../audit.ts";
import { bps, BOOKING_COMMISSION_BPS, formatMoney } from "../money.ts";
import { createBookingOrderTx } from "./billing.ts";
import { registerSweep } from "../queue.ts";
import { localDate, localTime, zonedToUtc } from "../tz.ts";

const HOLD_MIN = 15;
const ACTIVE = `(status IN ('confirmed','completed') OR (status='held' AND hold_expires_at > ?))`;

// ---------------- Public directory
export function listStudios(q?: string) {
  const like = `%${(q ?? "").replace(/[%_]/g, "")}%`;
  return all(
    `SELECT s.id, s.name, s.slug, s.tagline, s.city, s.hue, s.deposit_pct,
       (SELECT MIN(rate_minor * 60 / duration_min) FROM services WHERE studio_id=s.id AND active=1) from_hourly_minor,
       (SELECT COUNT(*) FROM rooms WHERE studio_id=s.id) rooms,
       (SELECT GROUP_CONCAT(name, ' · ') FROM (SELECT name FROM services WHERE studio_id=s.id AND active=1 LIMIT 3)) services
     FROM studios s WHERE s.name LIKE ? OR s.city LIKE ? OR s.tagline LIKE ? ORDER BY s.name`,
    like, like, like,
  );
}

export function getStudioPublic(idOrSlug: string) {
  const s = one("SELECT * FROM studios WHERE id=? OR slug=?", idOrSlug, idOrSlug);
  if (!s) throw notFound("Studio not found");
  return {
    id: s.id, name: s.name, slug: s.slug, tagline: s.tagline, description: s.description, city: s.city, address: s.address,
    timezone: s.timezone, openHour: s.open_hour, closeHour: s.close_hour, depositPct: s.deposit_pct, cancellationPolicy: s.cancellation_policy, hue: s.hue,
    rooms: all("SELECT id, name, capacity, description FROM rooms WHERE studio_id=?", s.id),
    services: all("SELECT id, name, description, duration_min, rate_minor FROM services WHERE studio_id=? AND active=1 ORDER BY rate_minor", s.id),
    engineers: all(
      "SELECT u.id, u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.studio_id=? AND m.revoked_at IS NULL AND m.role IN ('engineer','owner')",
      s.id,
    ),
  };
}

// ---------------- Availability (GET /studios/{id}/availability)
export function availability(studioId: string, input: unknown) {
  const { date, serviceId, roomId, engineerId } = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    serviceId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    engineerId: z.string().uuid().optional(),
  }).parse(input);
  const s = one("SELECT * FROM studios WHERE id=?", studioId);
  if (!s) throw notFound();
  const svc = one("SELECT * FROM services WHERE id=? AND studio_id=? AND active=1", serviceId, studioId);
  if (!svc) throw notFound("Service not found");
  const rooms = roomId ? all("SELECT id, name FROM rooms WHERE id=? AND studio_id=?", roomId, studioId) : all("SELECT id, name FROM rooms WHERE studio_id=?", studioId);
  const dayStart = zonedToUtc(date, s.open_hour, 0, s.timezone);
  const dayEnd = zonedToUtc(date, s.close_hour, 0, s.timezone);
  const t = now();
  const busy = all(`SELECT room_id, engineer_user_id, starts_at, ends_at FROM bookings WHERE studio_id=? AND ${ACTIVE} AND starts_at < ? AND ends_at > ?`, studioId, t, dayEnd.toISOString(), dayStart.toISOString());
  const blackouts = all("SELECT room_id, starts_at, ends_at FROM blackouts WHERE studio_id=? AND starts_at < ? AND ends_at > ?", studioId, dayEnd.toISOString(), dayStart.toISOString());
  const slots: { startsAt: string; endsAt: string; label: string; roomIds: string[] }[] = [];
  for (let m = 0; ; m += 30) {
    const st = new Date(dayStart.getTime() + m * 60000);
    const en = new Date(st.getTime() + svc.duration_min * 60000);
    if (en > dayEnd) break;
    if (st.getTime() < Date.now() + 30 * 60000) continue;
    const S = st.toISOString(), E = en.toISOString();
    const free = rooms.filter((r) =>
      !busy.some((b) => b.starts_at < E && b.ends_at > S && (b.room_id === r.id || (engineerId && b.engineer_user_id === engineerId))) &&
      !blackouts.some((b) => (b.room_id === null || b.room_id === r.id) && b.starts_at < E && b.ends_at > S),
    );
    if (free.length) slots.push({ startsAt: S, endsAt: E, label: localTime(st, s.timezone), roomIds: free.map((r) => r.id) });
  }
  return { timezone: s.timezone, date, service: { id: svc.id, name: svc.name, durationMin: svc.duration_min, rateMinor: svc.rate_minor }, slots };
}

function assertNoCollision(studioId: string, roomId: string, engineerId: string | null, startsAt: string, endsAt: string, excludeId = "") {
  const clash = one(
    `SELECT id FROM bookings WHERE id != ? AND ${ACTIVE} AND starts_at < ? AND ends_at > ?
       AND (room_id = ? OR (? IS NOT NULL AND engineer_user_id = ?))`,
    excludeId, now(), endsAt, startsAt, roomId, engineerId, engineerId,
  );
  if (clash) throw conflict("That slot was just taken — pick another time", "slot_taken");
  const black = one("SELECT reason FROM blackouts WHERE studio_id=? AND (room_id IS NULL OR room_id=?) AND starts_at < ? AND ends_at > ?", studioId, roomId, endsAt, startsAt);
  if (black) throw conflict(`Studio unavailable: ${black.reason || "blackout"}`);
}

function ensureClient(studioId: string, userId: string) {
  const c = one("SELECT id FROM clients WHERE studio_id=? AND user_id=?", studioId, userId);
  if (c) return c.id as string;
  const u = one("SELECT name, email, phone FROM users WHERE id=?", userId)!;
  const id = uuid();
  insert("clients", { id, studio_id: studioId, user_id: userId, name: u.name, email: u.email, phone: u.phone, created_at: now() });
  return id;
}

// ---------------- Bookings (POST /bookings → hold + deposit order)
export const bookingInput = z.object({
  studioId: z.string().uuid(),
  serviceId: z.string().uuid(),
  roomId: z.string().uuid(),
  engineerId: z.string().uuid().optional().nullable(),
  startsAt: z.string().datetime(),
  notes: z.string().max(500).default(""),
});

export function createBookingHold(actorIn: Actor | null, input: unknown) {
  const actor = requireActor(actorIn);
  const d = bookingInput.parse(input);
  return tx(() => {
    const s = one("SELECT * FROM studios WHERE id=?", d.studioId);
    const svc = one("SELECT * FROM services WHERE id=? AND studio_id=? AND active=1", d.serviceId, d.studioId);
    const room = one("SELECT * FROM rooms WHERE id=? AND studio_id=?", d.roomId, d.studioId);
    if (!s || !svc || !room) throw notFound("Studio, service or room not found");
    if (d.engineerId && !one("SELECT 1 FROM memberships WHERE studio_id=? AND user_id=? AND revoked_at IS NULL", d.studioId, d.engineerId)) throw badRequest("Engineer is not on this studio's team");
    const start = new Date(d.startsAt);
    if (start.getTime() < Date.now() + 15 * 60000) throw badRequest("Pick a time at least 15 minutes from now");
    const end = new Date(start.getTime() + svc.duration_min * 60000);
    const localStart = Number(localTime(start, s.timezone).slice(0, 2));
    const localEndMin = (() => { const [h, m] = localTime(end, s.timezone).split(":").map(Number); return h * 60 + m; })();
    if (localStart < s.open_hour || localEndMin > s.close_hour * 60 || localDate(start, s.timezone) !== localDate(new Date(end.getTime() - 1), s.timezone))
      throw badRequest("Outside studio opening hours");
    assertNoCollision(d.studioId, d.roomId, d.engineerId ?? null, start.toISOString(), end.toISOString());
    const quoted = svc.rate_minor;
    const deposit = Math.max(100, Math.round((quoted * s.deposit_pct) / 100));
    const holdExpires = addMinutes(new Date(), HOLD_MIN);
    const id = uuid();
    const clientId = ensureClient(d.studioId, actor.id);
    insert("bookings", {
      id, studio_id: d.studioId, room_id: d.roomId, service_id: d.serviceId, engineer_user_id: d.engineerId ?? null,
      artist_user_id: actor.id, client_id: clientId, starts_at: start.toISOString(), ends_at: end.toISOString(),
      status: "held", hold_expires_at: holdExpires, quoted_minor: quoted, deposit_minor: deposit, source: "platform", notes: d.notes, created_at: now(),
    });
    const orderId = createBookingOrderTx(actor.id, id, deposit, `${svc.name} at ${s.name} — ${localDate(start, s.timezone)} ${localTime(start, s.timezone)} (${s.deposit_pct}% deposit)`, s.owner_user_id, holdExpires);
    audit(actor.id, "booking.hold", "booking", id);
    return { bookingId: id, orderId, holdExpiresAt: holdExpires, depositMinor: deposit, quotedMinor: quoted };
  });
}

export const manualBookingInput = bookingInput.extend({
  clientId: z.string().uuid().optional(),
  clientName: z.string().trim().min(2).max(80).optional(),
  clientPhone: z.string().max(30).optional(),
  paidMajor: z.coerce.number().min(0).default(0),
});

/** Walk-in / phone bookings entered by staff: confirmed immediately, no platform commission. */
export function createManualBooking(actorIn: Actor | null, input: unknown) {
  const d = manualBookingInput.parse(input);
  const { actor } = requireStudio(actorIn, d.studioId, "manager");
  return tx(() => {
    const svc = one("SELECT * FROM services WHERE id=? AND studio_id=?", d.serviceId, d.studioId);
    if (!svc || !one("SELECT 1 FROM rooms WHERE id=? AND studio_id=?", d.roomId, d.studioId)) throw notFound();
    const start = new Date(d.startsAt);
    const end = new Date(start.getTime() + svc.duration_min * 60000);
    assertNoCollision(d.studioId, d.roomId, d.engineerId ?? null, start.toISOString(), end.toISOString());
    let clientId = d.clientId;
    if (clientId && !one("SELECT 1 FROM clients WHERE id=? AND studio_id=?", clientId, d.studioId)) throw notFound("Client not found");
    if (!clientId) {
      if (!d.clientName) throw badRequest("Choose a client or enter a name");
      clientId = uuid();
      insert("clients", { id: clientId, studio_id: d.studioId, name: d.clientName, phone: d.clientPhone ?? null, created_at: now() });
    }
    const id = uuid();
    const paid = Math.round(d.paidMajor * 100);
    insert("bookings", {
      id, studio_id: d.studioId, room_id: d.roomId, service_id: d.serviceId, engineer_user_id: d.engineerId ?? null, client_id: clientId,
      starts_at: start.toISOString(), ends_at: end.toISOString(), status: "confirmed", quoted_minor: svc.rate_minor,
      deposit_minor: 0, paid_minor: paid, source: "manual", notes: d.notes, created_at: now(),
    });
    if (paid > 0) recordCash(d.studioId, id, paid, actor.id);
    audit(actor.id, "booking.manual", "booking", id);
    if (d.engineerId) notify(d.engineerId, "booking", "New session assigned", `${svc.name} · ${start.toUTCString()}`, "/studio");
    return { bookingId: id };
  });
}

function recordCash(studioId: string, bookingId: string, amount: number, actorId: string) {
  // Off-platform cash (walk-ins) is tracked in the ledger without platform fees, with an audit trail.
  const orderId = uuid();
  insert("orders", { id: orderId, reference: `CASH-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, buyer_id: actorId, kind: "booking", status: "paid", total_minor: amount, currency: "GHS", booking_id: bookingId, created_at: now(), paid_at: now() });
  insert("ledger_entries", { id: uuid(), order_id: orderId, event_key: `cash:${orderId}`, account: `studio:${studioId}`, entry_type: "collected", amount_minor: amount, currency: "GHS", created_at: now() });
  insert("ledger_entries", { id: uuid(), order_id: orderId, event_key: `cash:${orderId}`, account: `studio:${studioId}`, entry_type: "seller_payable", amount_minor: amount, currency: "GHS", created_at: now() });
  audit(actorId, "finance.manual_payment", "booking", bookingId, { amount });
}

const TRANSITIONS: Record<string, string[]> = {
  held: ["cancelled"],
  confirmed: ["cancelled", "completed", "rescheduled"],
  completed: [],
  cancelled: [],
  expired: [],
};

export function patchBooking(actorIn: Actor | null, bookingId: string, input: unknown) {
  const actor = requireActor(actorIn);
  const d = z.object({ action: z.enum(["cancel", "reschedule", "complete", "record_payment", "assign"]), startsAt: z.string().datetime().optional(), roomId: z.string().uuid().optional(), engineerId: z.string().uuid().nullable().optional(), amountMajor: z.coerce.number().positive().optional(), reason: z.string().max(300).optional() }).parse(input);
  return tx(() => {
    const b = one("SELECT * FROM bookings WHERE id=?", bookingId);
    if (!b) throw notFound("Booking not found");
    const m = membershipFor(actor, b.studio_id);
    const isArtist = b.artist_user_id === actor.id;
    const isManager = m && m.role !== "engineer";
    if (!isArtist && !m) throw notFound("Booking not found");
    const target = d.action === "cancel" ? "cancelled" : d.action === "complete" ? "completed" : d.action === "reschedule" ? "rescheduled" : null;
    if (target && !TRANSITIONS[b.status]?.includes(target)) throw conflict(`A ${b.status} booking can't be ${target}`);
    switch (d.action) {
      case "cancel": {
        if (!isArtist && !isManager) throw forbidden();
        if (isArtist && !isManager && new Date(b.starts_at).getTime() - Date.now() < 24 * 3600_000 && b.status === "confirmed")
          throw conflict("Cancellations within 24 hours must be arranged with the studio (see cancellation policy)");
        run("UPDATE bookings SET status='cancelled' WHERE id=?", bookingId);
        run("UPDATE orders SET status='expired' WHERE booking_id=? AND status IN ('pending','processing')", bookingId);
        const studio = one("SELECT owner_user_id, name FROM studios WHERE id=?", b.studio_id)!;
        if (b.artist_user_id && !isArtist) notify(b.artist_user_id, "booking", "Session cancelled", `${studio.name} cancelled your session. ${d.reason ?? ""}`, "/library");
        if (isArtist) notify(studio.owner_user_id, "booking", "Client cancelled a session", new Date(b.starts_at).toUTCString(), "/studio");
        break;
      }
      case "reschedule": {
        if (!isManager) throw forbidden("Only studio managers can reschedule");
        if (!d.startsAt) throw badRequest("startsAt required");
        const dur = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
        const s = new Date(d.startsAt), e = new Date(s.getTime() + dur);
        const room = d.roomId ?? b.room_id;
        if (!one("SELECT 1 FROM rooms WHERE id=? AND studio_id=?", room, b.studio_id)) throw notFound("Room not found");
        assertNoCollision(b.studio_id, room, b.engineer_user_id, s.toISOString(), e.toISOString(), bookingId);
        run("UPDATE bookings SET starts_at=?, ends_at=?, room_id=? WHERE id=?", s.toISOString(), e.toISOString(), room, bookingId);
        if (b.artist_user_id) notify(b.artist_user_id, "booking", "Session rescheduled", s.toUTCString(), "/library");
        break;
      }
      case "complete":
        if (!m) throw forbidden();
        run("UPDATE bookings SET status='completed' WHERE id=?", bookingId);
        break;
      case "record_payment": {
        if (!isManager || !(m!.role === "owner" || m!.canViewFinance)) throw forbidden("Financial actions require finance access");
        if (!d.amountMajor) throw badRequest("Amount required");
        const amt = Math.round(d.amountMajor * 100);
        if (b.paid_minor + amt > b.quoted_minor) throw badRequest(`Exceeds balance due (${formatMoney(b.quoted_minor - b.paid_minor)})`);
        run("UPDATE bookings SET paid_minor = paid_minor + ? WHERE id=?", amt, bookingId);
        recordCash(b.studio_id, bookingId, amt, actor.id);
        break;
      }
      case "assign": {
        if (!isManager) throw forbidden();
        if (d.engineerId && !one("SELECT 1 FROM memberships WHERE studio_id=? AND user_id=? AND revoked_at IS NULL", b.studio_id, d.engineerId)) throw badRequest("Not a team member");
        if (d.engineerId) assertNoCollision(b.studio_id, "__none__", d.engineerId, b.starts_at, b.ends_at, bookingId);
        run("UPDATE bookings SET engineer_user_id=? WHERE id=?", d.engineerId ?? null, bookingId);
        if (d.engineerId) notify(d.engineerId, "booking", "Session assigned to you", new Date(b.starts_at).toUTCString(), "/studio");
        break;
      }
    }
    audit(actor.id, `booking.${d.action}`, "booking", bookingId, d);
    return { ok: true };
  });
}

registerSweep(() => {
  run("UPDATE bookings SET status='expired' WHERE status='held' AND hold_expires_at < ?", now());
});

export function myBookings(actorIn: Actor | null) {
  const actor = requireActor(actorIn);
  return all(
    `SELECT b.id, b.starts_at, b.ends_at, b.status, b.quoted_minor, b.deposit_minor, b.paid_minor, b.hold_expires_at,
       s.name studio_name, s.slug studio_slug, s.hue, s.timezone, sv.name service_name, r.name room_name, u.name engineer_name,
       (SELECT id FROM orders WHERE booking_id=b.id AND status IN ('pending','processing') LIMIT 1) pending_order_id
     FROM bookings b JOIN studios s ON s.id=b.studio_id JOIN services sv ON sv.id=b.service_id JOIN rooms r ON r.id=b.room_id
     LEFT JOIN users u ON u.id=b.engineer_user_id WHERE b.artist_user_id=? ORDER BY b.starts_at DESC LIMIT 100`,
    actor.id,
  );
}

// ---------------- Studio workspace (dashboard)
export function myStudios(actor: Actor) {
  return actor.memberships.map((m) => ({ ...one("SELECT id, name, slug, hue FROM studios WHERE id=?", m.studioId), role: m.role, canViewFinance: m.role === "owner" || m.canViewFinance }));
}

export function studioWorkspace(actorIn: Actor | null, studioId: string) {
  const { actor, membership } = requireStudio(actorIn, studioId);
  const s = one("SELECT * FROM studios WHERE id=?", studioId)!;
  const finance = membership.role === "owner" || membership.canViewFinance;
  const isEngineer = membership.role === "engineer";
  const today = localDate(new Date(), s.timezone);
  const dayStart = zonedToUtc(today, 0, 0, s.timezone).toISOString();
  const dayEnd = zonedToUtc(today, 23, 59, s.timezone).toISOString();
  const engFilter = isEngineer ? " AND b.engineer_user_id = ?" : "";
  const engParams = isEngineer ? [actor.id] : [];
  const bookingsToday = one<{ n: number }>(`SELECT COUNT(*) n FROM bookings b WHERE studio_id=? AND status IN ('confirmed','completed','held') AND starts_at >= ? AND starts_at <= ?${engFilter}`, studioId, dayStart, dayEnd, ...engParams)!.n;
  const upcoming = all(
    `SELECT b.*, c.name client_name, sv.name service_name, r.name room_name, u.name engineer_name
     FROM bookings b LEFT JOIN clients c ON c.id=b.client_id JOIN services sv ON sv.id=b.service_id JOIN rooms r ON r.id=b.room_id LEFT JOIN users u ON u.id=b.engineer_user_id
     WHERE b.studio_id=? AND b.ends_at >= ? AND b.status IN ('confirmed','held')${engFilter} ORDER BY b.starts_at LIMIT 12`,
    studioId, now(), ...engParams,
  ).map((b) => ({ ...b, local_time: localTime(b.starts_at, s.timezone), local_date: localDate(new Date(b.starts_at), s.timezone) }));
  const openProjects = one<{ n: number }>("SELECT COUNT(*) n FROM projects WHERE studio_id=? AND status IN ('draft','active','in_review','approved')", studioId)!.n;
  let finance7: { day: string; collectedMinor: number }[] | null = null;
  let collectedWeek: number | null = null;
  if (finance) {
    finance7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = localDate(new Date(Date.now() - i * 86400_000), s.timezone);
      const from = zonedToUtc(d, 0, 0, s.timezone).toISOString();
      const to = zonedToUtc(d, 23, 59, s.timezone).toISOString();
      const v = one<{ v: number }>("SELECT COALESCE(SUM(amount_minor),0) v FROM ledger_entries WHERE account=? AND entry_type IN ('collected','collected_refund') AND created_at BETWEEN ? AND ?", `studio:${studioId}`, from, to)!.v;
      finance7.push({ day: d, collectedMinor: v });
    }
    collectedWeek = finance7.reduce((a, b) => a + b.collectedMinor, 0);
  }
  return {
    studio: getStudioPublic(studioId),
    role: membership.role,
    canViewFinance: finance,
    stats: { bookingsToday, openProjects, collectedWeekMinor: collectedWeek },
    upcoming,
    revenue7: finance7,
  };
}

export function calendar(actorIn: Actor | null, studioId: string, input: unknown) {
  const { actor, membership } = requireStudio(actorIn, studioId);
  const { from, days } = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.coerce.number().int().min(1).max(14).default(7) }).parse(input);
  const s = one("SELECT * FROM studios WHERE id=?", studioId)!;
  const start = zonedToUtc(from, 0, 0, s.timezone);
  const end = new Date(start.getTime() + days * 86400_000);
  const rows = all(
    `SELECT b.id, b.starts_at, b.ends_at, b.status, b.room_id, b.engineer_user_id, b.source, b.quoted_minor, b.paid_minor, b.deposit_minor, b.notes,
       c.id client_id, c.name client_name, sv.name service_name, r.name room_name, u.name engineer_name
     FROM bookings b LEFT JOIN clients c ON c.id=b.client_id JOIN services sv ON sv.id=b.service_id JOIN rooms r ON r.id=b.room_id LEFT JOIN users u ON u.id=b.engineer_user_id
     WHERE b.studio_id=? AND b.starts_at < ? AND b.ends_at > ? AND b.status IN ('held','confirmed','completed')`,
    studioId, end.toISOString(), start.toISOString(),
  );
  const visible = membership.role === "engineer" ? rows.filter((r) => r.engineer_user_id === actor.id) : rows;
  const finance = membership.role === "owner" || membership.canViewFinance;
  return {
    timezone: s.timezone, openHour: s.open_hour, closeHour: s.close_hour,
    rooms: all("SELECT id, name FROM rooms WHERE studio_id=?", studioId),
    bookings: visible.map((b) => ({
      ...b,
      local_date: localDate(new Date(b.starts_at), s.timezone),
      local_start: localTime(b.starts_at, s.timezone),
      local_end: localTime(b.ends_at, s.timezone),
      ...(finance ? {} : { quoted_minor: undefined, paid_minor: undefined, deposit_minor: undefined }),
    })),
  };
}

export function bookingDetail(actorIn: Actor | null, bookingId: string) {
  const actor = requireActor(actorIn);
  const b = one("SELECT * FROM bookings WHERE id=?", bookingId);
  if (!b) throw notFound();
  const { membership } = requireStudio(actor, b.studio_id);
  if (membership.role === "engineer" && b.engineer_user_id !== actor.id) throw notFound();
  const finance = membership.role === "owner" || membership.canViewFinance;
  const client = b.client_id ? one("SELECT id, name, email, phone, private_notes FROM clients WHERE id=?", b.client_id) : null;
  const history = b.client_id
    ? all("SELECT b.id, b.starts_at, b.status, sv.name service_name FROM bookings b JOIN services sv ON sv.id=b.service_id WHERE client_id=? AND b.id != ? ORDER BY starts_at DESC LIMIT 6", b.client_id, bookingId)
    : [];
  return { booking: { ...b, ...(finance ? {} : { quoted_minor: null, paid_minor: null, deposit_minor: null }) }, client: membership.role === "engineer" ? (client ? { name: client.name } : null) : client, history };
}

// ---------------- CRM (ST-03)
export function listClients(actorIn: Actor | null, studioId: string) {
  const { membership } = requireStudio(actorIn, studioId, "manager");
  const finance = membership.role === "owner" || membership.canViewFinance;
  return all(
    `SELECT c.*,
      (SELECT COUNT(*) FROM bookings WHERE client_id=c.id AND status IN ('confirmed','completed')) bookings,
      (SELECT COUNT(*) FROM projects WHERE client_id=c.id) projects,
      (SELECT MAX(starts_at) FROM bookings WHERE client_id=c.id) last_session,
      (SELECT COALESCE(SUM(quoted_minor - paid_minor),0) FROM bookings WHERE client_id=c.id AND status IN ('confirmed','completed'))
        + (SELECT COALESCE(SUM(price_minor - paid_minor),0) FROM projects WHERE client_id=c.id AND status != 'archived') balance
     FROM clients c WHERE studio_id=? ORDER BY c.name`,
    studioId,
  ).map((c) => (finance ? c : { ...c, balance: null }));
}

export function upsertClient(actorIn: Actor | null, studioId: string, input: unknown) {
  const { actor } = requireStudio(actorIn, studioId, "manager");
  const d = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(2).max(80), email: z.string().email().optional().or(z.literal("")), phone: z.string().max(30).optional(), privateNotes: z.string().max(4000).optional() }).parse(input);
  if (d.id) {
    if (!one("SELECT 1 FROM clients WHERE id=? AND studio_id=?", d.id, studioId)) throw notFound();
    run("UPDATE clients SET name=?, email=?, phone=?, private_notes=COALESCE(?, private_notes) WHERE id=?", d.name, d.email || null, d.phone ?? null, d.privateNotes ?? null, d.id);
    audit(actor.id, "client.update", "client", d.id);
    return { id: d.id };
  }
  const id = uuid();
  insert("clients", { id, studio_id: studioId, name: d.name, email: d.email || null, phone: d.phone ?? null, private_notes: d.privateNotes ?? "", created_at: now() });
  audit(actor.id, "client.create", "client", id);
  return { id };
}

export function exportClientsCsv(actorIn: Actor | null, studioId: string) {
  const { actor } = requireStudio(actorIn, studioId, "manager");
  audit(actor.id, "client.export", "studio", studioId);
  const rows = listClients(actor, studioId);
  return toCsv(["name", "email", "phone", "bookings", "projects", "last_session", "balance_ghs"], rows.map((r) => [r.name, r.email, r.phone, r.bookings, r.projects, r.last_session, r.balance == null ? "" : (r.balance / 100).toFixed(2)]));
}

export function toCsv(header: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // CSV injection guard
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

// ---------------- Staff (ST-04)
export function listTeam(actorIn: Actor | null, studioId: string) {
  requireStudio(actorIn, studioId, "manager");
  return {
    members: all("SELECT m.id, m.role, m.can_view_finance, m.revoked_at, m.created_at, u.id user_id, u.name, u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE studio_id=? ORDER BY m.revoked_at IS NOT NULL, m.role", studioId),
    invites: all("SELECT id, email, role, expires_at, accepted_at FROM invites WHERE studio_id=? AND accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC", studioId, now()),
  };
}

export function inviteStaff(actorIn: Actor | null, studioId: string, input: unknown) {
  const { actor } = requireStudio(actorIn, studioId, "manager");
  const d = z.object({ email: z.string().email(), role: z.enum(["manager", "engineer"]), canViewFinance: z.boolean().default(false) }).parse(input);
  const token = crypto.randomBytes(24).toString("base64url");
  insert("invites", { id: uuid(), studio_id: studioId, email: d.email.toLowerCase(), role: d.role, can_view_finance: d.canViewFinance, token_hash: crypto.createHash("sha256").update(token).digest("hex"), expires_at: addMinutes(new Date(), 72 * 60), created_by: actor.id, created_at: now() });
  audit(actor.id, "staff.invite", "studio", studioId, { email: d.email, role: d.role, canViewFinance: d.canViewFinance });
  const studio = one("SELECT name FROM studios WHERE id=?", studioId);
  queueInviteEmail({ key: `invite-${token.slice(0, 16)}`, to: d.email.toLowerCase(), studioName: studio?.name ?? "a studio", inviterName: actor.name, role: d.role, path: `/invite/${token}`, expiresInHours: 72 });
  return { inviteUrl: `/invite/${token}`, expiresInHours: 72, emailed: true };
}

export function inviteInfo(token: string) {
  const inv = one("SELECT i.*, s.name studio_name FROM invites i JOIN studios s ON s.id=i.studio_id WHERE token_hash=?", crypto.createHash("sha256").update(token).digest("hex"));
  if (!inv || inv.accepted_at || inv.expires_at < now()) throw notFound("This invite link is invalid or has expired");
  return { studioName: inv.studio_name, role: inv.role, email: inv.email };
}

export function acceptInvite(actorIn: Actor | null, token: string) {
  const actor = requireActor(actorIn);
  return tx(() => {
    const inv = one("SELECT * FROM invites WHERE token_hash=?", crypto.createHash("sha256").update(token).digest("hex"));
    if (!inv || inv.accepted_at || inv.expires_at < now()) throw notFound("This invite link is invalid or has expired");
    if (inv.email !== actor.email.toLowerCase()) throw forbidden(`This invite was sent to ${inv.email}`);
    const existing = one("SELECT id FROM memberships WHERE studio_id=? AND user_id=?", inv.studio_id, actor.id);
    if (existing) run("UPDATE memberships SET role=?, can_view_finance=?, revoked_at=NULL WHERE id=?", inv.role, inv.can_view_finance, existing.id);
    else insert("memberships", { id: uuid(), studio_id: inv.studio_id, user_id: actor.id, role: inv.role, can_view_finance: inv.can_view_finance, created_at: now() });
    run("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'engineer')", actor.id);
    run("UPDATE invites SET accepted_at=? WHERE id=?", now(), inv.id);
    audit(actor.id, "staff.join", "studio", inv.studio_id, { role: inv.role });
    return { studioId: inv.studio_id };
  });
}

export function updateMember(actorIn: Actor | null, studioId: string, membershipId: string, input: unknown) {
  const { actor } = requireStudio(actorIn, studioId, "manager");
  const d = z.object({ action: z.enum(["revoke", "restore", "finance_on", "finance_off"]) }).parse(input);
  const m = one("SELECT * FROM memberships WHERE id=? AND studio_id=?", membershipId, studioId);
  if (!m) throw notFound();
  if (m.role === "owner") throw forbidden("The owner's access can't be changed");
  if (d.action.startsWith("finance") && actor.memberships.find((x) => x.studioId === studioId)?.role !== "owner") throw forbidden("Only the owner can grant finance access");
  const sql = { revoke: "revoked_at=?", restore: "revoked_at=NULL", finance_on: "can_view_finance=1", finance_off: "can_view_finance=0" }[d.action];
  // Revocation is immediate: authorization reloads memberships on every request.
  run(`UPDATE memberships SET ${sql} WHERE id=?`, ...(d.action === "revoke" ? [now(), membershipId] : [membershipId]));
  audit(actor.id, `staff.${d.action}`, "membership", membershipId, { userId: m.user_id });
}

// ---------------- Finance (ST-05)
export function studioReport(actorIn: Actor | null, studioId: string, input: unknown) {
  requireStudio(actorIn, studioId, "finance");
  const d = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), serviceId: z.string().uuid().optional().or(z.literal("")) }).parse(input);
  const s = one("SELECT timezone FROM studios WHERE id=?", studioId)!;
  const from = zonedToUtc(d.from, 0, 0, s.timezone).toISOString();
  const to = zonedToUtc(d.to, 23, 59, s.timezone).toISOString();
  const svc = d.serviceId ? " AND b.service_id = ?" : "";
  const svcP = d.serviceId ? [d.serviceId] : [];
  const bookings = all(
    `SELECT b.id, b.starts_at, b.status, b.source, b.quoted_minor, b.deposit_minor, b.paid_minor, sv.name service, c.name client
     FROM bookings b JOIN services sv ON sv.id=b.service_id LEFT JOIN clients c ON c.id=b.client_id
     WHERE b.studio_id=? AND b.starts_at BETWEEN ? AND ? AND b.status IN ('confirmed','completed','cancelled')${svc} ORDER BY b.starts_at`,
    studioId, from, to, ...svcP,
  );
  const ledger = (types: string) => one<{ v: number }>(`SELECT COALESCE(SUM(l.amount_minor),0) v FROM ledger_entries l WHERE l.account=? AND l.entry_type IN (${types}) AND l.created_at BETWEEN ? AND ?`, `studio:${studioId}`, from, to)!.v;
  const platformFees = one<{ v: number }>(
    `SELECT COALESCE(SUM(l.amount_minor),0) v FROM ledger_entries l JOIN orders o ON o.id=l.order_id
     LEFT JOIN bookings b ON b.id=o.booking_id LEFT JOIN projects p ON p.id=o.project_id
     WHERE l.entry_type IN ('platform_fee','provider_fee') AND (b.studio_id=? OR p.studio_id=?) AND l.created_at BETWEEN ? AND ?`,
    studioId, studioId, from, to,
  )!.v;
  const expenses = all("SELECT * FROM expenses WHERE studio_id=? AND spent_on BETWEEN ? AND ? ORDER BY spent_on DESC", studioId, d.from, d.to);
  const confirmed = bookings.filter((b) => b.status !== "cancelled");
  return {
    summary: {
      bookingValueMinor: confirmed.reduce((a, b) => a + b.quoted_minor, 0),
      collectedMinor: ledger("'collected','collected_refund'"),
      depositsMinor: confirmed.reduce((a, b) => a + Math.min(b.deposit_minor, b.paid_minor), 0),
      outstandingMinor: confirmed.reduce((a, b) => a + Math.max(0, b.quoted_minor - b.paid_minor), 0),
      refundsMinor: -ledger("'collected_refund'"),
      platformFeesMinor: platformFees,
      expensesMinor: expenses.reduce((a, e) => a + e.amount_minor, 0),
      netMinor: ledger("'seller_payable','refund'") - expenses.reduce((a, e) => a + e.amount_minor, 0),
      commissionNote: `Platform commission (${BOOKING_COMMISSION_BPS / 100}%) applies only to bookings made through SoundzRoot. Walk-ins and your own clients are never charged.`,
    },
    bookings,
    expenses,
  };
}

export function reportCsv(actorIn: Actor | null, studioId: string, input: unknown) {
  const r = studioReport(actorIn, studioId, input);
  audit(actorIn!.id, "finance.export", "studio", studioId);
  return toCsv(["date", "client", "service", "source", "status", "booking_value_ghs", "deposit_ghs", "collected_ghs", "outstanding_ghs"],
    r.bookings.map((b) => [b.starts_at, b.client, b.service, b.source, b.status, (b.quoted_minor / 100).toFixed(2), (b.deposit_minor / 100).toFixed(2), (b.paid_minor / 100).toFixed(2), (Math.max(0, b.quoted_minor - b.paid_minor) / 100).toFixed(2)]));
}

export function addExpense(actorIn: Actor | null, studioId: string, input: unknown) {
  const { actor } = requireStudio(actorIn, studioId, "finance");
  const d = z.object({ description: z.string().trim().min(2).max(120), amountMajor: z.coerce.number().positive(), spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input);
  const id = uuid();
  insert("expenses", { id, studio_id: studioId, description: d.description, amount_minor: Math.round(d.amountMajor * 100), spent_on: d.spentOn, created_by: actor.id, created_at: now() });
  audit(actor.id, "finance.expense", "expense", id, d);
}

export function updateStudioSettings(actorIn: Actor | null, studioId: string, input: unknown) {
  const { actor } = requireStudio(actorIn, studioId, "manager");
  const d = z.object({
    tagline: z.string().max(120).optional(), description: z.string().max(1500).optional(),
    openHour: z.coerce.number().int().min(0).max(23).optional(), closeHour: z.coerce.number().int().min(1).max(24).optional(),
    depositPct: z.coerce.number().int().min(0).max(100).optional(), cancellationPolicy: z.string().max(800).optional(),
  }).parse(input);
  if (d.openHour !== undefined && d.closeHour !== undefined && d.openHour >= d.closeHour) throw badRequest("Opening hour must be before closing");
  run(
    `UPDATE studios SET tagline=COALESCE(?,tagline), description=COALESCE(?,description), open_hour=COALESCE(?,open_hour), close_hour=COALESCE(?,close_hour),
     deposit_pct=COALESCE(?,deposit_pct), cancellation_policy=COALESCE(?,cancellation_policy) WHERE id=?`,
    d.tagline ?? null, d.description ?? null, d.openHour ?? null, d.closeHour ?? null, d.depositPct ?? null, d.cancellationPolicy ?? null, studioId,
  );
  audit(actor.id, "studio.settings", "studio", studioId, d);
}

export function addBlackout(actorIn: Actor | null, studioId: string, input: unknown) {
  const { actor } = requireStudio(actorIn, studioId, "manager");
  const d = z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime(), roomId: z.string().uuid().optional().nullable(), reason: z.string().max(120).default("") }).parse(input);
  if (d.endsAt <= d.startsAt) throw badRequest("End must be after start");
  insert("blackouts", { id: uuid(), studio_id: studioId, room_id: d.roomId ?? null, starts_at: d.startsAt, ends_at: d.endsAt, reason: d.reason });
  audit(actor.id, "studio.blackout", "studio", studioId, d);
}

