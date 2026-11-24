import { route } from "@/server/api";
import { addBlackout } from "@/server/modules/studio";

export const POST = route<{ studioId: string }>(async ({ actor, params, json }) => addBlackout(actor, params.studioId, await json()));
