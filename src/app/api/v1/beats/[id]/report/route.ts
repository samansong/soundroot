import { route } from "@/server/api";
import { reportBeat } from "@/server/modules/catalog";

export const POST = route<{ id: string }>(async ({ actor, params, json }) => reportBeat(actor, params.id, (await json()).reason), { limit: 10 });
