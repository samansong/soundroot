import { route } from "@/server/api";
import { openDispute } from "@/server/modules/billing";

export const POST = route<{ id: string }>(async ({ actor, params, json }) => openDispute(actor, params.id, (await json()).reason));
