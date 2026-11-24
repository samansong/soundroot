import { route } from "@/server/api";
import { addExpense } from "@/server/modules/studio";

export const POST = route<{ studioId: string }>(async ({ actor, params, json }) => addExpense(actor, params.studioId, await json()));
