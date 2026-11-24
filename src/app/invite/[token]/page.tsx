import Link from "next/link";
import { inviteInfo } from "@/server/modules/studio";
import { getActor } from "@/server/session";
import { AcceptInvite } from "./AcceptInvite";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const actor = await getActor();
  let info;
  try { info = inviteInfo(token); } catch (e: any) { return <div className="page"><div className="empty">{e.message}</div></div>; }
  return (
    <div className="page auth-wrap">
      <div className="card auth-card stack lg" style={{ padding: 30 }}>
        <div className="eyebrow">Team invite</div>
        <h2>Join {info.studioName}</h2>
        <p className="text-2">You've been invited as <b>{info.role}</b> ({info.email}).</p>
        {actor ? <AcceptInvite token={token} /> : (
          <div className="stack">
            <Link className="btn btn-primary" href={`/signup?next=/invite/${token}`}>Create an account</Link>
            <Link className="btn" href={`/login?next=/invite/${token}`}>I already have an account</Link>
          </div>
        )}
      </div>
    </div>
  );
}
