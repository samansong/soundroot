import { route } from "@/server/api";
import { downloadDeliverable } from "@/server/modules/projects";

export const GET = route<{ id: string; assetId: string }>(({ actor, params }) => downloadDeliverable(actor, params.id, params.assetId));
