import { z } from "zod";
import { route } from "@/server/api";
import { addRole } from "@/server/modules/identity";

export const GET = route(({ actor }) => ({ actor }));
export const POST = route(async ({ actor, json }) => {
  const { role } = z.object({ role: z.enum(["artist", "beatmaker"]) }).parse(await json());
  addRole(actor, role);
});
