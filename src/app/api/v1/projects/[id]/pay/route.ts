import { route } from "@/server/api";
import { createProjectOrder } from "@/server/modules/billing";

export const POST = route<{ id: string }>(({ actor, params }) => createProjectOrder(actor, params.id));
