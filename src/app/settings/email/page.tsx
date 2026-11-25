import Link from "next/link";
import { EMAIL_CATEGORIES, getEmailPrefs, userFromPrefsToken } from "@/server/email/prefs";
import { getActor } from "@/server/session";
import { EmailPrefsForm } from "./EmailPrefsForm";

export const metadata = { title: "Email preferences" };
export const dynamic = "force-dynamic";

export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const actor = await getActor();
  const viaLink = !actor ? userFromPrefsToken(token) : null;
  const user = actor ?? viaLink;
  if (!user) {
    return (
      <div className="page auth-wrap">
        <div className="card auth-card stack lg" style={{ padding: 30 }}>
          <div className="eyebrow">Email preferences</div>
          <h2>Sign in to manage your emails</h2>
          <p className="text-2">Or open this page from the &ldquo;Manage email preferences&rdquo; link at the bottom of any SoundzRoot email.</p>
          <Link href="/login?next=/settings/email" className="btn btn-primary">Sign in</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="eyebrow">Settings</div>
      <h1 style={{ marginTop: 10 }}>Email preferences</h1>
      <p className="text-2" style={{ marginTop: 10 }}>
        Choose which notification emails we send to <b>{user.email}</b>. You&apos;ll still see every notification under the bell in the app.
      </p>
      <EmailPrefsForm
        initial={getEmailPrefs(user.id)}
        categories={EMAIL_CATEGORIES.map(({ id, label, description }) => ({ id, label, description }))}
        token={viaLink ? token : undefined}
      />
    </div>
  );
}
