import { route } from "@/server/api";
import { updateMember } from "@/server/modules/studio";

export const PATCH = route<{ studioId: string; membershipId: string }>(async ({ actor, params, json }) => updateMember(actor, params.studioId, params.membershipId, await json()));
