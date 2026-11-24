import { route } from "@/server/api";
import { postMessage } from "@/server/modules/projects";

export const POST = route<{ id: string }>(async ({ actor, params, json }) => postMessage(actor, params.id, (await json()).body));
