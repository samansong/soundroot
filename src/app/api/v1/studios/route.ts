import { route } from "@/server/api";
import { listStudios } from "@/server/modules/studio";

export const GET = route(({ query }) => listStudios(query.q));
