import { z } from "zod";
import { route } from "@/server/api";
import { adminOverview, moderateReport, setProducerVerified } from "@/server/modules/admin";
import { refundOrder, resolveDispute } from "@/server/modules/billing";

export const GET = route(({ actor }) => adminOverview(actor));
export const POST = route(async ({ actor, json }) => {
  const d = z.discriminatedUnion("action", [
    z.object({ action: z.literal("report"), id: z.string(), decision: z.enum(["takedown", "dismiss"]), note: z.string().max(500).default("") }),
    z.object({ action: z.literal("dispute"), id: z.string(), decision: z.enum(["refund", "no_action"]), note: z.string().max(500).default("") }),
    z.object({ action: z.literal("refund"), id: z.string(), amount: z.number().positive().optional() }),
    z.object({ action: z.literal("verify_producer"), id: z.string(), verified: z.boolean() }),
  ]).parse(await json());
  if (d.action === "report") moderateReport(actor, d.id, d.decision, d.note);
  else if (d.action === "dispute") resolveDispute(actor, d.id, d.decision, d.note);
  else if (d.action === "refund") refundOrder(actor, d.id, d.amount);
  else setProducerVerified(actor, d.id, d.verified);
});
