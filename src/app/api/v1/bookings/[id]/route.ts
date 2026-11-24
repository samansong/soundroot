import { route } from "@/server/api";
import { bookingDetail, patchBooking } from "@/server/modules/studio";

export const GET = route<{ id: string }>(({ actor, params }) => bookingDetail(actor, params.id));
export const PATCH = route<{ id: string }>(async ({ actor, params, json }) => patchBooking(actor, params.id, await json()));
