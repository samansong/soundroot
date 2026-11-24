import { route } from "@/server/api";
import { inviteStaff, listTeam } from "@/server/modules/studio";

type P = { studioId: string };
export const GET = route<P>(({ actor, params }) => listTeam(actor, params.studioId));
export const POST = route<P>(async ({ actor, params, json }) => inviteStaff(actor, params.studioId, await json()));
