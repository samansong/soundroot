import { route } from "@/server/api";
import { exportProject } from "@/server/modules/projects";

export const GET = route<{ id: string }>(({ actor, params }) =>
  new Response(JSON.stringify(exportProject(actor, params.id), null, 2), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=project-export.json" } }),
);
