import { route, readUpload } from "@/server/api";
import { addVersion } from "@/server/modules/projects";

export const POST = route<{ id: string }>(async ({ actor, params, req }) => {
  const { file, form } = await readUpload(req);
  const peaks = form.get("peaks");
  return addVersion(actor, params.id, file, {
    label: String(form.get("label") ?? ""),
    notes: String(form.get("notes") ?? ""),
    peaks: typeof peaks === "string" ? JSON.parse(peaks) : undefined,
    durationMs: Number(form.get("durationMs")) || undefined,
  });
}, { limit: 30 });
