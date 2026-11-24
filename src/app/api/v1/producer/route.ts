import { route } from "@/server/api";
import { myCatalog, updateProducerProfile } from "@/server/modules/catalog";

export const GET = route(({ actor }) => myCatalog(actor));
export const PATCH = route(async ({ actor, json }) => updateProducerProfile(actor, await json()));
