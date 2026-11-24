import { redirect } from "next/navigation";
import { getActor } from "@/server/session";
import { AdminConsole } from "./AdminConsole";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/admin");
  if (!actor.roles.includes("admin")) redirect("/");
  return <div className="page"><AdminConsole /></div>;
}
