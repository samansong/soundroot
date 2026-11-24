import Link from "next/link";
import { redirect } from "next/navigation";
import { listProjects } from "@/server/modules/projects";
import { getActor } from "@/server/session";
import { StatusBadge } from "@/components/ui";
import { money } from "@/lib/format";
import { MiniWave } from "./MiniWave";

export const metadata = { title: "My projects" };

export default async function ProjectsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/projects");
  const projects = listProjects(actor);
  return (
    <div className="page stack lg">
      <header className="row between wrap">
        <div><div className="eyebrow">Projects</div><h1 style={{ marginTop: 10 }}>Your recording projects</h1></div>
        {actor.memberships.some((m) => m.role !== "engineer") && <Link href="/studio?tab=projects" className="btn btn-primary">New project</Link>}
      </header>
      {projects.length === 0 && <div className="empty">No projects yet. When a studio adds you to a project it shows up here.</div>}
      <div className="grid cols-2">
        {projects.map((p, i) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="card stack fade-up" style={{ animationDelay: `${i * 50}ms`, borderColor: p.status === "in_review" ? "rgba(242,184,75,.35)" : undefined }}>
            <div className="row between">
              <div className="row" style={{ gap: 12 }}>
                <div style={{ width: 12, height: 44, borderRadius: 6, background: `linear-gradient(hsl(${p.hue} 80% 65%), hsl(${(p.hue + 40) % 360} 80% 50%))`, boxShadow: `0 0 20px hsl(${p.hue} 80% 50% / .5)` }} />
                <div><h3>{p.title}</h3><div className="muted small">{p.studio_name} · {p.client_name ?? "—"}{p.engineer_name ? ` · Eng. ${p.engineer_name}` : ""}</div></div>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <MiniWave peaks={p.waveform} hue={p.hue} />
            <div className="row between small muted">
              <span>{p.versions} version{p.versions === 1 ? "" : "s"} · revisions {p.revisions_used}/{p.revision_allowance}</span>
              <span>{p.due_date ? `Due ${new Date(p.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""} · {money(p.paid_minor)} / {money(p.price_minor)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
