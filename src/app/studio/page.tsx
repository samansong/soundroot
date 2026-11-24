import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/server/session";
import { myStudios } from "@/server/modules/studio";
import { StudioWorkspace } from "./StudioWorkspace";

export const metadata = { title: "Studio workspace" };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ s?: string; tab?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/studio");
  const studios = myStudios(actor);
  if (studios.length === 0) {
    return (
      <div className="page"><div className="empty">You're not on a studio team yet. <Link className="gold" href="/signup">Register a studio</Link> or ask a studio owner for an invite link.</div></div>
    );
  }
  const sp = await searchParams;
  const current = studios.find((s) => s.id === sp.s) ?? studios[0];
  return (
    <div className="page">
      <StudioWorkspace key={current.id} studios={studios} studioId={current.id} role={current.role} canFinance={current.canViewFinance} initialTab={sp.tab} me={actor.id} />
    </div>
  );
}
