import { notFound, redirect } from "next/navigation";
import { getProject } from "@/server/modules/projects";
import { getActor } from "@/server/session";
import { Workspace } from "./Workspace";

export const metadata = { title: "Project workspace" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=/projects/${id}`);
  let p;
  try { p = getProject(actor, id); } catch { notFound(); }
  return <div className="page"><Workspace initial={p} /></div>;
}
