import { route } from "@/server/api";
import { reportCsv, studioReport } from "@/server/modules/studio";

export const GET = route<{ studioId: string }>(({ actor, params, query }) =>
  query.format === "csv"
    ? new Response(reportCsv(actor, params.studioId, query), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename=report-${query.from}-${query.to}.csv` } })
    : studioReport(actor, params.studioId, query),
);
