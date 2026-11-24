// Thin HTTP layer for /api/v1 route handlers: actor resolution, CSRF origin checks, rate limits, error mapping.
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import "./index.ts";
import { type Actor, actorFromToken, SESSION_COOKIE } from "./auth.ts";
import { AppError } from "./errors.ts";

export interface Ctx<P> {
  req: NextRequest;
  actor: Actor | null;
  params: P;
  ip: string;
  json: () => Promise<any>;
  query: Record<string, string>;
}

const buckets = new Map<string, { tokens: number; at: number }>();
function rateLimit(key: string, perMinute: number) {
  const b = buckets.get(key) ?? { tokens: perMinute, at: Date.now() };
  const refill = ((Date.now() - b.at) / 60_000) * perMinute;
  b.tokens = Math.min(perMinute, b.tokens + refill);
  b.at = Date.now();
  if (b.tokens < 1) throw new AppError(429, "rate_limited", "Too many requests — slow down");
  b.tokens -= 1;
  buckets.set(key, b);
}

export function route<P = Record<string, string>>(
  fn: (ctx: Ctx<P>) => unknown,
  opts: { csrf?: boolean; limit?: number } = {},
) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
      rateLimit(`${ip}:${req.method}:${req.nextUrl.pathname.split("/").slice(0, 4).join("/")}`, opts.limit ?? 240);
      if (req.method !== "GET" && opts.csrf !== false) {
        // CSRF: SameSite=Lax cookies + require same-origin for state-changing requests.
        const origin = req.headers.get("origin");
        const site = req.headers.get("sec-fetch-site");
        if ((origin && new URL(origin).host !== req.headers.get("host")) || site === "cross-site") {
          throw new AppError(403, "csrf", "Cross-site request blocked");
        }
      }
      const actor = actorFromToken(req.cookies.get(SESSION_COOKIE)?.value);
      const params = (await segment?.params) ?? ({} as P);
      const result = await fn({
        req, actor, params, ip,
        json: async () => { try { return await req.json(); } catch { throw new AppError(400, "bad_json", "Invalid JSON body"); } },
        query: Object.fromEntries(req.nextUrl.searchParams.entries()),
      });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  if (e instanceof ZodError) {
    const i = e.issues[0];
    const field = i.path.join(".");
    return NextResponse.json({ error: { code: "validation", message: field ? `${field}: ${i.message}` : i.message, issues: e.issues } }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

export function setSessionCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
  return res;
}

export async function readUpload(req: NextRequest, field = "file") {
  const form = await req.formData();
  const f = form.get(field);
  if (!f || typeof f === "string") throw new AppError(400, "no_file", "No file uploaded");
  const data = new Uint8Array(await f.arrayBuffer());
  return { file: { name: f.name, type: f.type, data }, form };
}
