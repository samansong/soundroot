import { route } from "@/server/api";
import { startCheckout } from "@/server/modules/billing";

export const POST = route(async ({ actor, json }) => startCheckout(actor, await json()), { limit: 30 });
