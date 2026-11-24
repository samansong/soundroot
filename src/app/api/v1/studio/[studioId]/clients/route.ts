import { route } from "@/server/api";
import { exportClientsCsv, listClients, upsertClient } from "@/server/modules/studio";

type P = { studioId: string };
export const GET = route<P>(({ actor, params, query }) =>
  query.format === "csv"
    ? new Response(exportClientsCsv(actor, params.studioId), { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=clients.csv" } })
    : listClients(actor, params.studioId),
);
export const POST = route<P>(async ({ actor, params, json }) => upsertClient(actor, params.studioId, await json()));
