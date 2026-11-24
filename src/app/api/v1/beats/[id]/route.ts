import { z } from "zod";
import { route } from "@/server/api";
import { getBeat, setBeatStatus, setLicenses, updateBeat } from "@/server/modules/catalog";

export const GET = route<{ id: string }>(({ actor, params }) => getBeat(params.id, actor));
export const PATCH = route<{ id: string }>(async ({ actor, params, json }) => {
  const body = z.object({
    action: z.enum(["update", "licenses", "publish", "unpublish", "archive", "draft"]),
    data: z.any().optional(),
    declareOwnership: z.boolean().optional(),
  }).parse(await json());
  if (body.action === "update") updateBeat(actor, params.id, body.data);
  else if (body.action === "licenses") setLicenses(actor, params.id, body.data);
  else setBeatStatus(actor, params.id, body.action, body.declareOwnership);
  return { ok: true };
});
