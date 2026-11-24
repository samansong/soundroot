import { route } from "@/server/api";
import { downloadBeatAsset } from "@/server/modules/billing";

export const GET = route<{ id: string }>(({ actor, params }) => downloadBeatAsset(actor, params.id));
