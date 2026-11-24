import { route, readUpload } from "@/server/api";
import { addDeliverable } from "@/server/modules/projects";

export const POST = route<{ id: string }>(async ({ actor, params, req }) => addDeliverable(actor, params.id, (await readUpload(req)).file));
