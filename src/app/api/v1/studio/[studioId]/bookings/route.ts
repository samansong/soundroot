import { route } from "@/server/api";
import { createManualBooking } from "@/server/modules/studio";

export const POST = route<{ studioId: string }>(async ({ actor, params, json }) => createManualBooking(actor, { ...(await json()), studioId: params.studioId }));
