import { z } from "zod";
import { route } from "@/server/api";
import { finalize, getProject, setProjectStatus } from "@/server/modules/projects";

export const GET = route<{ id: string }>(({ actor, params }) => getProject(actor, params.id));
export const PATCH = route<{ id: string }>(async ({ actor, params, json }) => {
  const d = z.object({ action: z.enum(["finalize", "archive", "reopen"]), versionId: z.string().uuid().optional() }).parse(await json());
  if (d.action === "finalize") finalize(actor, params.id, d.versionId!);
  else setProjectStatus(actor, params.id, d.action === "archive" ? "archived" : "active");
});
