import crypto from "node:crypto";
import { insert, now, uuid } from "../db.ts";

export const VERIFY_HOURS = 48;

/** Issues a single-use email verification token; only its hash is stored. Called when the email is actually sent. */
export function issueVerificationToken(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  insert("email_verifications", { id: uuid(), user_id: userId, token_hash: hash, expires_at: new Date(Date.now() + VERIFY_HOURS * 3600_000).toISOString(), created_at: now() });
  return { path: `/verify-email/${token}`, key: hash.slice(0, 24), expiresInHours: VERIFY_HOURS };
}
