import { route } from "@/server/api";
import { licenseDocument } from "@/server/modules/billing";

export const GET = route<{ id: string }>(({ actor, params }) => {
  const { pdf, filename } = licenseDocument(actor, params.id);
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${filename}"` } });
});
