import { route } from "@/server/api";
import { handlePaymentWebhook } from "@/server/modules/billing";

// Server-to-server: no cookies/CSRF; authenticity comes from the HMAC signature.
export const POST = route(async ({ req }) => handlePaymentWebhook(await req.text(), req.headers.get("x-sandboxpay-signature")), { csrf: false, limit: 600 });
