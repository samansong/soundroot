import { NextResponse } from "next/server";
import { route, setSessionCookie } from "@/server/api";
import { signup } from "@/server/modules/identity";

export const POST = route(async ({ json }) => {
  const { session } = signup(await json());
  return setSessionCookie(NextResponse.json({ ok: true }), session.token, session.expires);
}, { limit: 10 });
