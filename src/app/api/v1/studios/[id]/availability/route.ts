import { route } from "@/server/api";
import { availability } from "@/server/modules/studio";

export const GET = route<{ id: string }>(({ params, query }) => availability(params.id, query));
