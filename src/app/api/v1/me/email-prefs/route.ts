import { route } from "@/server/api";
import { unauthorized } from "@/server/errors";
import { EMAIL_CATEGORIES, getEmailPrefs, setEmailPrefs, userFromPrefsToken } from "@/server/email/prefs";

// Works for the signed-in user, or with the signed ?token= from an email's "Manage email preferences" link.
function who(actor: { id: string; email: string } | null, token?: string) {
  const u = actor ?? userFromPrefsToken(token);
  if (!u) throw unauthorized("Sign in, or open this page from the link in one of our emails.");
  return u;
}

export const GET = route(({ actor, query }) => {
  const u = who(actor, query.token);
  return { email: u.email, prefs: getEmailPrefs(u.id), categories: EMAIL_CATEGORIES.map(({ id, label, description }) => ({ id, label, description })) };
});

export const PUT = route(async ({ actor, query, json }) => {
  const u = who(actor, query.token);
  return { prefs: setEmailPrefs(u.id, await json()) };
}, { limit: 60 });
