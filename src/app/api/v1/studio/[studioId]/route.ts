import { route } from "@/server/api";
import { studioWorkspace, updateStudioSettings } from "@/server/modules/studio";

type P = { studioId: string };
export const GET = route<P>(({ actor, params }) => studioWorkspace(actor, params.studioId));
export const PATCH = route<P>(async ({ actor, params, json }) => updateStudioSettings(actor, params.studioId, await json()));
