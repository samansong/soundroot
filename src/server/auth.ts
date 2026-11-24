import crypto from "node:crypto";
import { all, insert, now, one, run, uuid } from "./db.ts";
import { forbidden, unauthorized } from "./errors.ts";

export type Role = "artist" | "beatmaker" | "studio_owner" | "engineer" | "admin";

export interface Membership {
  studioId: string;
  role: "owner" | "manager" | "engineer";
  canViewFinance: boolean;
}

export interface Actor {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  producerId: string | null;
  memberships: Membership[];
}

export const SESSION_COOKIE = "sr_session";
const SESSION_DAYS = 14;

// scrypt with per-user salt (N=2^15). Format: scrypt$N$salt$hash
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const N = 32768;
  const hash = crypto.scryptSync(password, salt, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const got = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return crypto.timingSafeEqual(expected, got);
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function createSession(userId: string): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  insert("sessions", { id: sha256(token), user_id: userId, expires_at: expires.toISOString(), created_at: now() });
  return { token, expires };
}

export function destroySession(token: string) {
  run("DELETE FROM sessions WHERE id = ?", sha256(token));
}

export function actorFromToken(token: string | undefined | null): Actor | null {
  if (!token) return null;
  const s = one<{ user_id: string; expires_at: string }>(
    "SELECT user_id, expires_at FROM sessions WHERE id = ?",
    sha256(token),
  );
  if (!s || s.expires_at < now()) return null;
  return loadActor(s.user_id);
}

export function loadActor(userId: string): Actor | null {
  const u = one("SELECT id, name, email FROM users WHERE id = ?", userId);
  if (!u) return null;
  const roles = all<{ role: Role }>("SELECT role FROM user_roles WHERE user_id = ?", userId).map((r) => r.role);
  const producer = one<{ id: string }>("SELECT id FROM producer_profiles WHERE user_id = ?", userId);
  const memberships = all(
    "SELECT studio_id, role, can_view_finance FROM memberships WHERE user_id = ? AND revoked_at IS NULL",
    userId,
  ).map((m) => ({ studioId: m.studio_id, role: m.role, canViewFinance: !!m.can_view_finance }));
  return { id: u.id, name: u.name, email: u.email, roles, producerId: producer?.id ?? null, memberships };
}

// ---- Authorization helpers. Every service function calls these; UI hiding is never relied on.
export function requireActor(a: Actor | null): Actor {
  if (!a) throw unauthorized();
  return a;
}
export function hasRole(a: Actor, r: Role) {
  return a.roles.includes(r);
}
export function requireRole(a: Actor | null, r: Role): Actor {
  const actor = requireActor(a);
  if (!hasRole(actor, r)) throw forbidden(`This action requires the ${r.replace("_", " ")} role`);
  return actor;
}
export function membershipFor(a: Actor, studioId: string) {
  return a.memberships.find((m) => m.studioId === studioId) ?? null;
}
/** level: "staff" = any active member, "manager" = owner/manager, "finance" = owner or finance grant */
export function requireStudio(a: Actor | null, studioId: string, level: "staff" | "manager" | "finance" = "staff") {
  const actor = requireActor(a);
  const m = membershipFor(actor, studioId);
  if (!m) throw forbidden("You are not a member of this studio");
  if (level === "manager" && m.role === "engineer") throw forbidden("Studio managers only");
  if (level === "finance" && !(m.role === "owner" || m.canViewFinance)) throw forbidden("Financial records are restricted");
  return { actor, membership: m };
}

export function newUser(input: { email: string; name: string; password: string; phone?: string; roles: Role[] }) {
  const id = uuid();
  insert("users", {
    id,
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    phone: input.phone ?? null,
    password_hash: hashPassword(input.password),
    // Email verification link is sent in production; dev auto-verifies.
    email_verified_at: now(),
    created_at: now(),
  });
  for (const r of new Set(input.roles)) insert("user_roles", { user_id: id, role: r });
  return id;
}
