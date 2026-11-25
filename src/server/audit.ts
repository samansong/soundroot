import { insert, now, uuid } from "./db.ts";
import { queueNotificationEmail } from "./email/send.ts";

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
  const id = uuid();
  insert("notifications", {
    id,
    user_id: userId,
    kind,
    title,
    body,
    link: link ?? null,
    created_at: now(),
  });
  // Every in-app notification is mirrored as a branded email (sent by the job queue via Resend).
  queueNotificationEmail(`notification-${id}`, userId, kind, title, body, link);
}
