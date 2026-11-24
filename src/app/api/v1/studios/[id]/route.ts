import { route } from "@/server/api";
import { getStudioPublic } from "@/server/modules/studio";

export const GET = route<{ id: string }>(({ params }) => getStudioPublic(params.id));
