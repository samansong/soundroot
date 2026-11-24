import { route } from "@/server/api";
import { createBeatOrder, myOrders } from "@/server/modules/billing";

export const GET = route(({ actor }) => myOrders(actor));
export const POST = route(async ({ actor, json }) => createBeatOrder(actor, await json()), { limit: 30 });
