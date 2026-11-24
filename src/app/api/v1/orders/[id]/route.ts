import { route } from "@/server/api";
import { getOrder } from "@/server/modules/billing";

export const GET = route<{ id: string }>(({ actor, params }) => getOrder(actor, params.id));
