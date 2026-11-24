import { redirect } from "next/navigation";
import { getActor } from "@/server/session";
import { ProducerDashboard } from "./ProducerDashboard";

export const metadata = { title: "Producer studio" };

export default async function ProducerPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/producer");
  if (!actor.roles.includes("beatmaker")) redirect("/");
  return <div className="page"><ProducerDashboard /></div>;
}
