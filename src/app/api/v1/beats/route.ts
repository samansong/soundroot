import { route } from "@/server/api";
import { createBeat, searchBeats } from "@/server/modules/catalog";

export const GET = route(({ query }) => searchBeats(query));
export const POST = route(async ({ actor, json }) => createBeat(actor, await json()));
