import { route } from "@/server/api";
import { badRequest } from "@/server/errors";
import { setEmailPrefs, userFromPrefsToken } from "@/server/email/prefs";

/**
 * RFC 8058 one-click unsubscribe target (List-Unsubscribe-Post). Mail providers POST here without
 * cookies or an Origin header, so CSRF origin checks are off; the signed token is the authorization.
 */
export const POST = route(({ query }) => {
  const u = userFromPrefsToken(query.token);
  if (!u) throw badRequest("Invalid unsubscribe link");
  setEmailPrefs(u.id, { all: false });
  return { ok: true, unsubscribed: u.email };
}, { csrf: false, limit: 30 });
