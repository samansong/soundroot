// Notification email preferences. Users can switch categories off (or everything) from
// /settings/email, or from the signed "manage preferences" link in every email — no sign-in needed.
// Account and safety emails (verification, invites, disputes, moderation, admin finance alerts) are always sent.
import crypto from "node:crypto";
import { z } from "zod";
import { all, now, one, run } from "../db.ts";

export const EMAIL_CATEGORIES = [
  { id: "sales", label: "Sales & payouts", description: "When you sell a beat or a payout is sent.", kinds: ["sale", "payout"] },
  { id: "orders", label: "Orders & payments", description: "Licenses ready, payment receipts and failed payments.", kinds: ["order", "payment"] },
  { id: "bookings", label: "Studio bookings", description: "Sessions confirmed, assigned, rescheduled or cancelled.", kinds: ["booking"] },
  { id: "projects", label: "Projects & messages", description: "New mix versions, comments, approvals, deliveries and messages.", kinds: ["project", "message"] },
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number]["id"];
export type EmailPrefs = { all: boolean } & Record<EmailCategory, boolean>;

/** null = not optional (always sent). */
export function categoryFor(kind: string): EmailCategory | null {
  return EMAIL_CATEGORIES.find((c) => (c.kinds as readonly string[]).includes(kind))?.id ?? null;
}

export function getEmailPrefs(userId: string): EmailPrefs {
  const rows = all<{ category: string; enabled: number }>("SELECT category, enabled FROM email_prefs WHERE user_id=?", userId);
  const v = (c: string) => rows.find((r) => r.category === c)?.enabled !== 0;
  return { all: v("all"), ...Object.fromEntries(EMAIL_CATEGORIES.map((c) => [c.id, v(c.id)])) } as EmailPrefs;
}

const prefsInput = z.object({ all: z.boolean().optional(), ...Object.fromEntries(EMAIL_CATEGORIES.map((c) => [c.id, z.boolean().optional()])) }).strict();

export function setEmailPrefs(userId: string, input: unknown): EmailPrefs {
  const d = prefsInput.parse(input) as Partial<EmailPrefs>;
  for (const [category, enabled] of Object.entries(d)) {
    if (typeof enabled !== "boolean") continue;
    run("INSERT INTO email_prefs (user_id, category, enabled, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, category) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at", userId, category, enabled ? 1 : 0, now());
  }
  return getEmailPrefs(userId);
}

export function notificationEmailAllowed(userId: string, kind: string) {
  const cat = categoryFor(kind);
  if (!cat) return true;
  const p = getEmailPrefs(userId);
  return p.all && p[cat];
}

// ---- Signed link so people can manage email from an email without signing in.
const secret = () => process.env.URL_SIGNING_SECRET || "dev-url-signing-secret-change-me";
const mac = (userId: string) => crypto.createHmac("sha256", secret()).update(`email-prefs:${userId}`).digest("base64url").slice(0, 32);

export function prefsToken(userId: string) {
  return `${userId}.${mac(userId)}`;
}
export function userFromPrefsToken(token: string | null | undefined): { id: string; email: string; name: string } | null {
  if (!token) return null;
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = mac(userId);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return one("SELECT id, email, name FROM users WHERE id=?", userId) ?? null;
}
export const prefsPath = (userId: string) => `/settings/email?token=${encodeURIComponent(prefsToken(userId))}`;
