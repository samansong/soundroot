import { NextResponse } from "next/server";
import { route, setSessionCookie } from "@/server/api";
import { login } from "@/server/modules/identity";

export const POST = route(async ({ json, ip }) => {
  const { session } = login(await json(), ip);
  return setSessionCookie(NextResponse.json({ ok: true }), session.token, session.expires);
}, { limit: 20 });
