// Transactional email via Resend (https://resend.com), delivered by the durable job queue so a
// Resend outage only delays mail (retries with backoff) and never fails the user's request.
// Without RESEND_API_KEY (local dev, tests) emails are logged instead of sent.
import { one } from "../db.ts";
import { enqueue, registerJob } from "../queue.ts";
import { inviteEmail, notificationEmail, welcomeEmail, type Rendered } from "./templates.ts";

const FROM = () => process.env.EMAIL_FROM || "SoundzRoot <notice@soundzroot.com>";
const REPLY_TO = () => process.env.EMAIL_REPLY_TO || undefined;

type Job =
  | { kind: "notification"; key: string; userId: string; type: string; title: string; body: string; link?: string | null }
  | { kind: "welcome"; key: string; userId: string }
  | { kind: "invite"; key: string; to: string; studioName: string; inviterName: string; role: string; path: string; expiresInHours: number };

export function queueNotificationEmail(key: string, userId: string, type: string, title: string, body: string, link?: string | null) {
  enqueue("send_email", { kind: "notification", key, userId, type, title, body, link } satisfies Job);
}
export function queueWelcomeEmail(userId: string) {
  enqueue("send_email", { kind: "welcome", key: `welcome-${userId}`, userId } satisfies Job);
}
export function queueInviteEmail(j: Omit<Extract<Job, { kind: "invite" }>, "kind">) {
  enqueue("send_email", { kind: "invite", ...j } satisfies Job);
}

function recipient(userId: string) {
  const u = one("SELECT id, email, name FROM users WHERE id=?", userId);
  return (u ?? null) as { id: string; email: string; name: string } | null;
}

function render(job: Job): { to: string; mail: Rendered } | null {
  if (job.kind === "invite") return { to: job.to, mail: inviteEmail(job) };
  const u = recipient(job.userId);
  if (!u) return null;
  if (job.kind === "welcome") {
    const roles = (one("SELECT group_concat(role) r FROM user_roles WHERE user_id=?", u.id)?.r ?? "").split(",");
    return { to: u.email, mail: welcomeEmail({ name: u.name, roles }) };
  }
  return { to: u.email, mail: notificationEmail({ name: u.name, type: job.type, title: job.title, body: job.body, link: job.link }) };
}

export async function deliver(to: string, mail: Rendered, idempotencyKey: string) {
  // Never send to reserved test domains (demo seed accounts use @soundroot.test).
  if (/\.(test|example|invalid|localhost)$/i.test(to.split("@")[1] ?? "")) return { skipped: "test address" };
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "test") console.log(`[email] (not sent: RESEND_API_KEY unset) to=${to} subject="${mail.subject}"`);
    return { skipped: "no api key" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.slice(0, 256) },
    body: JSON.stringify({ from: FROM(), to: [to], reply_to: REPLY_TO(), subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    // 4xx other than rate limiting will not succeed on retry: log and drop instead of retrying.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      console.error(`[email] rejected by Resend (${res.status}) to=${to}: ${detail}`);
      return { rejected: res.status };
    }
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
  const { id } = (await res.json()) as { id: string };
  console.log(`[email] sent ${id} to=${to} subject="${mail.subject}"`);
  return { id };
}

registerJob("send_email", async (job: Job) => {
  const r = render(job);
  if (!r) return;
  await deliver(r.to, r.mail, job.key);
});
