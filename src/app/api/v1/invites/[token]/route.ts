import { route } from "@/server/api";
import { acceptInvite, inviteInfo } from "@/server/modules/studio";

export const GET = route<{ token: string }>(({ params }) => inviteInfo(params.token));
export const POST = route<{ token: string }>(({ actor, params }) => acceptInvite(actor, params.token));
