import fs from "node:fs";
import { route } from "@/server/api";
import { one } from "@/server/db";
import { AppError } from "@/server/errors";
import { keyPath, verifySignature } from "@/server/storage";

// Serves private objects only via valid, unexpired HMAC signatures. Supports Range for audio seeking.
export const GET = route<{ id: string }>(({ params, req }) => {
  const q = req.nextUrl.searchParams;
  if (!verifySignature(params.id, q.get("exp"), q.get("d"), q.get("sig"))) throw new AppError(403, "bad_signature", "Link expired or invalid");
  const a = one("SELECT * FROM assets WHERE id=?", params.id);
  if (!a || a.scan_status !== "clean") throw new AppError(404, "not_found", "Not found");
  const path = keyPath(a.object_key);
  const size = fs.statSync(path).size;
  const headers: Record<string, string> = {
    "content-type": a.mime,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=300",
    "content-disposition": `${q.get("d") === "attachment" ? "attachment" : "inline"}; filename="${a.filename}"`,
  };
  const range = req.headers.get("range");
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const buf = Buffer.alloc(end - start + 1);
    const fd = fs.openSync(path, "r");
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return new Response(buf, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(buf.length) } });
  }
  return new Response(fs.readFileSync(path), { headers: { ...headers, "content-length": String(size) } });
}, { limit: 2000 });
