import { z } from "zod";
import { route } from "@/server/api";
import { sandboxAuthorize } from "@/server/modules/billing";

// Stand-in for the payment provider's hosted checkout. Replace with the real PSP integration.
export const POST = route(async ({ json, req }) => {
  const d = z.object({ providerRef: z.string(), outcome: z.enum(["succeed", "fail"]) }).parse(await json());
  return sandboxAuthorize(d.providerRef, d.outcome, req.nextUrl.origin);
});
