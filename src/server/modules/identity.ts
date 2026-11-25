import crypto from "node:crypto";
// Identity module: signup, login, roles, profile bootstrap, notifications, data export.
import { z } from "zod";
import { all, insert, now, one, run, uuid } from "../db.ts";
import { type Actor, type Role, createSession, newUser, requireActor, verifyPassword } from "../auth.ts";
import { queueVerificationEmail, queueWelcomeEmail } from "../email/send.ts";
import { AppError, badRequest, conflict, unauthorized } from "../errors.ts";
import { audit } from "../audit.ts";
import { ensureProducerProfile } from "./catalog.ts";

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  roles: z.array(z.enum(["artist", "beatmaker", "studio_owner"])).min(1, "Choose at least one role"),
  studioName: z.string().trim().max(80).optional(),
  city: z.string().trim().max(60).optional(),
});

export function signup(input: unknown) {
  const d = signupSchema.parse(input);
  if (one("SELECT 1 FROM users WHERE email=?", d.email.toLowerCase())) throw conflict("An account with this email already exists");
  const userId = newUser({ email: d.email, name: d.name, phone: d.phone || undefined, password: d.password, roles: d.roles as Role[], verified: false });
  const actor = { id: userId, name: d.name, email: d.email, emailVerified: false, roles: d.roles as Role[], producerId: null, memberships: [] } as Actor;
  if (d.roles.includes("beatmaker")) ensureProducerProfile(actor, d.name);
  if (d.roles.includes("studio_owner")) {
    const name = d.studioName?.trim() || `${d.name}'s Studio`;
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let slug = base;
    for (let i = 2; one("SELECT 1 FROM studios WHERE slug=?", slug); i++) slug = `${base}-${i}`;
    const studioId = uuid();
    insert("studios", { id: studioId, owner_user_id: userId, name, slug, city: d.city ?? "Accra", tagline: "Recording · Mixing · Mastering", cancellation_policy: "Free cancellation up to 24 hours before your session. Deposits are non-refundable within 24 hours.", hue: Math.floor(Math.random() * 360), created_at: now() });
    insert("memberships", { id: uuid(), studio_id: studioId, user_id: userId, role: "owner", can_view_finance: 1, created_at: now() });
    insert("rooms", { id: uuid(), studio_id: studioId, name: "Studio A", capacity: 4 });
    insert("services", { id: uuid(), studio_id: studioId, name: "Recording session (2h)", duration_min: 120, rate_minor: 40000 });
  }
  audit(userId, "user.signup", "user", userId, { roles: d.roles });
  queueWelcomeEmail(userId);
  return { userId, session: createSession(userId) };
}

const attempts = new Map<string, { n: number; until: number }>();
export function login(input: unknown, ip: string) {
  const d = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(input);
  const key = `${ip}:${d.email.toLowerCase()}`;
  const a = attempts.get(key);
  if (a && a.n >= 8 && a.until > Date.now()) throw badRequest("Too many attempts — wait a few minutes", "rate_limited");
  const u = one("SELECT id, password_hash FROM users WHERE email=?", d.email.toLowerCase());
  if (!u || !verifyPassword(d.password, u.password_hash)) {
    attempts.set(key, { n: (a?.n ?? 0) + 1, until: Date.now() + 10 * 60_000 });
    throw unauthorized("Email or password is incorrect");
  }
  attempts.delete(key);
  return { userId: u.id as string, session: createSession(u.id) };
}

export function addRole(actorIn: Actor | null, role: "artist" | "beatmaker") {
  const actor = requireActor(actorIn);
  run("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)", actor.id, role);
  if (role === "beatmaker") ensureProducerProfile({ ...actor, roles: [...actor.roles, "beatmaker"] });
  audit(actor.id, "user.role_add", "user", actor.id, { role });
}

export function notifications(actorIn: Actor | null) {
  const actor = requireActor(actorIn);
  return {
    unread: one<{ n: number }>("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL", actor.id)!.n,
    items: all("SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30", actor.id),
  };
}

export function markNotificationsRead(actorIn: Actor | null) {
  const actor = requireActor(actorIn);
  run("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL", now(), actor.id);
}

/** Privacy: self-service export of personal data. */
export function exportMyData(actorIn: Actor | null) {
  const actor = requireActor(actorIn);
  audit(actor.id, "user.export", "user", actor.id);
  return {
    user: one("SELECT id, name, email, phone, created_at FROM users WHERE id=?", actor.id),
    roles: actor.roles,
    orders: all("SELECT reference, kind, status, total_minor, currency, created_at FROM orders WHERE buyer_id=?", actor.id),
    bookings: all("SELECT starts_at, ends_at, status FROM bookings WHERE artist_user_id=?", actor.id),
    comments: all("SELECT body, timestamp_ms, created_at FROM comments WHERE author_id=?", actor.id),
    exportedAt: now(),
  };
}

// ---------------------------------------------------------------- Email verification

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export type VerifyResult = { status: "verified" | "already" | "expired" | "invalid"; name?: string; email?: string };

export function verifyEmail(token: string): VerifyResult {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { status: "invalid" };
  const v = one("SELECT v.*, u.email_verified_at, u.name, u.email FROM email_verifications v JOIN users u ON u.id=v.user_id WHERE v.token_hash=?", sha(token));
  if (!v) return { status: "invalid" };
  if (v.email_verified_at) return { status: "already", name: v.name, email: v.email };
  if (v.used_at || v.expires_at < now()) return { status: "expired", name: v.name, email: v.email };
  run("UPDATE users SET email_verified_at=? WHERE id=? AND email_verified_at IS NULL", now(), v.user_id);
  run("UPDATE email_verifications SET used_at=? WHERE user_id=? AND used_at IS NULL", now(), v.user_id);
  audit(v.user_id, "user.email_verified", "user", v.user_id);
  return { status: "verified", name: v.name, email: v.email };
}

/** Re-sends the link. Limited to one per minute and five per day per account. */
export function resendVerification(actorIn: Actor | null) {
  const actor = requireActor(actorIn);
  if (actor.emailVerified) return { alreadyVerified: true };
  const recent = all("SELECT created_at FROM email_verifications WHERE user_id=? AND created_at > ? ORDER BY created_at DESC", actor.id, new Date(Date.now() - 86400_000).toISOString());
  if (recent[0] && Date.parse(recent[0].created_at) > Date.now() - 60_000) throw new AppError(429, "rate_limited", "We just sent a link — give it a minute before asking for another.");
  if (recent.length >= 5) throw new AppError(429, "rate_limited", "Too many verification emails today. Check your spam folder, or try again tomorrow.");
  queueVerificationEmail(actor.id);
  return { sent: true, email: actor.email };
}
