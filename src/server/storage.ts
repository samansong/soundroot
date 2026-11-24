// Private object storage with HMAC-signed, expiring URLs.
// Dev: local filesystem under data/storage (never web-served directly).
// Prod: swap put/read for S3/R2/GCS with native presigned URLs; signing contract is identical.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { insert, now, uuid } from "./db.ts";
import { badRequest } from "./errors.ts";

const secret = () => process.env.URL_SIGNING_SECRET || "dev-url-signing-secret-change-me";
export const storageRoot = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_DIR || "data/storage");

export const AUDIO_TYPES: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
};
export const MAX_AUDIO_BYTES = 120 * 1024 * 1024;
export const MAX_ZIP_BYTES = 500 * 1024 * 1024;

export function keyPath(key: string) {
  const p = path.resolve(/*turbopackIgnore: true*/ storageRoot(), key);
  if (!p.startsWith(storageRoot())) throw badRequest("Invalid object key");
  return p;
}

/** Minimal malware gate: rejects executables/scripts masquerading as media. Prod: ClamAV/provider scan + quarantine bucket. */
export function scan(buf: Uint8Array): "clean" | "quarantined" {
  const head = Buffer.from(buf.subarray(0, 4)).toString("latin1");
  if (head.startsWith("MZ") || head === "\x7fELF" || head.startsWith("#!")) return "quarantined";
  return "clean";
}

/** Validates actual bytes against the declared type (magic numbers), not just the extension. */
export function sniff(buf: Uint8Array): "wav" | "mp3" | "zip" | "png" | "jpg" | null {
  const b = Buffer.from(buf.subarray(0, 12));
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WAVE") return "wav";
  if (b.toString("latin1", 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "mp3";
  if (b[0] === 0x50 && b[1] === 0x4b) return "zip";
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "png";
  if (b[0] === 0xff && b[1] === 0xd8) return "jpg";
  return null;
}

export function putObject(opts: {
  ownerId: string | null;
  kind: string;
  filename: string;
  mime: string;
  data: Uint8Array;
}) {
  const id = uuid();
  const ext = path.extname(opts.filename).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const key = `${opts.kind}/${id.slice(0, 2)}/${id}${ext}`;
  const p = keyPath(key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, opts.data);
  const checksum = crypto.createHash("sha256").update(opts.data).digest("hex");
  const scanStatus = scan(opts.data);
  insert("assets", {
    id,
    owner_user_id: opts.ownerId,
    kind: opts.kind,
    object_key: key,
    filename: opts.filename.replace(/[^\w.\- ]/g, "_").slice(0, 120),
    mime: opts.mime,
    size: opts.data.byteLength,
    checksum,
    scan_status: scanStatus,
    created_at: now(),
  });
  return { id, key, checksum, scanStatus };
}

export function signUrl(assetId: string, ttlSeconds = 300, disposition: "inline" | "attachment" = "inline") {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto.createHmac("sha256", secret()).update(`${assetId}.${exp}.${disposition}`).digest("base64url");
  return `/api/v1/files/${assetId}?exp=${exp}&d=${disposition}&sig=${sig}`;
}

export function verifySignature(assetId: string, exp: string | null, d: string | null, sig: string | null) {
  if (!exp || !sig || !d) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  const expected = crypto.createHmac("sha256", secret()).update(`${assetId}.${exp}.${d}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
