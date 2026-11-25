import Link from "next/link";
import { verifyEmail } from "@/server/modules/identity";
import { getActor } from "@/server/session";
import { ResendButton } from "@/components/VerifyBanner";

export const metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const actor = await getActor();
  let r = verifyEmail(token);
  // An old or mistyped link doesn't matter if the signed-in user is already confirmed.
  if ((r.status === "expired" || r.status === "invalid") && actor?.emailVerified) r = { status: "already", name: actor.name, email: actor.email };
  const ok = r.status === "verified" || r.status === "already";
  return (
    <div className="page auth-wrap">
      <div className="card auth-card stack lg" style={{ padding: 34, textAlign: "center", justifyItems: "center" }}>
        <div className={`verify-badge ${ok ? "ok" : "bad"}`} aria-hidden>{ok ? "✓" : "!"}</div>
        <div className="eyebrow">{ok ? "Email confirmed" : "Verification link"}</div>
        <h2>
          {r.status === "verified" && <>You&apos;re all set{r.name ? `, ${r.name.split(" ")[0]}` : ""}.</>}
          {r.status === "already" && <>Your email is already confirmed.</>}
          {r.status === "expired" && <>This link has expired.</>}
          {r.status === "invalid" && <>This link isn&apos;t valid.</>}
        </h2>
        <p className="text-2" style={{ maxWidth: 380 }}>
          {ok
            ? `${r.email ?? "Your email"} is confirmed. You can now buy beats, book studio sessions and receive payouts.`
            : "Verification links work once and expire after 48 hours. Sign in and we'll send you a fresh one."}
        </p>
        <div className="row wrap" style={{ justifyContent: "center", gap: 10 }}>
          {ok ? (
            <>
              <Link href="/beats" className="btn btn-primary">Explore beats</Link>
              <Link href="/studios" className="btn">Find a studio</Link>
            </>
          ) : actor ? (
            <ResendButton />
          ) : (
            <Link href="/login" className="btn btn-primary">Sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}
