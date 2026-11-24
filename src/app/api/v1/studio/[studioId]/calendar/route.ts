import { route } from "@/server/api";
import { calendar } from "@/server/modules/studio";

export const GET = route<{ studioId: string }>(({ actor, params, query }) => calendar(actor, params.studioId, query));
