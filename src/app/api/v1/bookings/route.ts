import { route } from "@/server/api";
import { createBookingHold, myBookings } from "@/server/modules/studio";

export const GET = route(({ actor }) => myBookings(actor));
export const POST = route(async ({ actor, json }) => createBookingHold(actor, await json()), { limit: 30 });
