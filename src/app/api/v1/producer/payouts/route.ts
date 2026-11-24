import { z } from "zod";
import { route } from "@/server/api";
import { requestPayout, verifyPayoutIdentity } from "@/server/modules/billing";

export const POST = route(async ({ actor, json }) => {
  const { action } = z.object({ action: z.enum(["verify", "request"]) }).parse(await json());
  return action === "verify" ? verifyPayoutIdentity(actor) : requestPayout(actor);
});
