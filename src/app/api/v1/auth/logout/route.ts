import { NextResponse } from "next/server";
import { route } from "@/server/api";
import { destroySession, SESSION_COOKIE } from "@/server/auth";

export const POST = route(({ req }) => {
  const t = req.cookies.get(SESSION_COOKIE)?.value;
  if (t) destroySession(t);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
