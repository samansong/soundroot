import { route } from "@/server/api";
import { exportMyData } from "@/server/modules/identity";

export const GET = route(({ actor }) =>
  new Response(JSON.stringify(exportMyData(actor), null, 2), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=soundzroot-my-data.json" } }),
);
