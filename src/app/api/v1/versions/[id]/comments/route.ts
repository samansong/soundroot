import { route } from "@/server/api";
import { addComment } from "@/server/modules/projects";

export const POST = route<{ id: string }>(async ({ actor, params, json }) => addComment(actor, params.id, await json()));
