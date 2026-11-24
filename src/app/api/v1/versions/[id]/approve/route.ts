import { route } from "@/server/api";
import { approveVersion } from "@/server/modules/projects";

export const POST = route<{ id: string }>(({ actor, params }) => approveVersion(actor, params.id));
