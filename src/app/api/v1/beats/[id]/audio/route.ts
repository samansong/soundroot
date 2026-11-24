import { route, readUpload } from "@/server/api";
import { attachBeatAudio } from "@/server/modules/catalog";

export const POST = route<{ id: string }>(async ({ actor, params, req }) => {
  const { file, form } = await readUpload(req);
  const kind = form.get("kind") === "stems" ? "stems" : "master";
  const peaksRaw = form.get("peaks");
  const peaks = typeof peaksRaw === "string" ? (JSON.parse(peaksRaw) as number[]) : undefined;
  return attachBeatAudio(actor, params.id, kind, file, peaks);
}, { limit: 30 });
