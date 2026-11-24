// Server-component access to the current actor.
import { cookies } from "next/headers";
import "./index.ts";
import { type Actor, actorFromToken, SESSION_COOKIE } from "./auth.ts";

export async function getActor(): Promise<Actor | null> {
  const c = await cookies();
  return actorFromToken(c.get(SESSION_COOKIE)?.value);
}
