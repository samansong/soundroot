import { route } from "@/server/api";
import { resendVerification } from "@/server/modules/identity";

/** Re-send the verification link to the signed-in user. */
export const POST = route(({ actor }) => resendVerification(actor), { limit: 6 });
