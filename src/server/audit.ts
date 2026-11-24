import { insert, now, uuid } from "./db.ts";

/** Append-only audit trail for role changes, downloads, payouts, admin and financial actions. */
export function audit(
  actorId: string | null,
  action: string,
  resourceType: string,
  resourceId: string | null,
  payload?: unknown,
) {
  insert("audit_events", {
    id: uuid(),
    actor_id: actorId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    payload: payload === undefined ? null : JSON.stringify(payload),
    created_at: now(),
  });
}

export function notify(userId: string, kind: string, title: string, body = "", link?: string) {
  insert("notifications", {
    id: uuid(),
    user_id: userId,
    kind,
    title,
    body,
    link: link ?? null,
    created_at: now(),
  });
  // Transactional email would be enqueued here (ST-06); in development we log it.
  if (process.env.NODE_ENV !== "test") console.log(`[email] to=${userId} ${title}`);
}
