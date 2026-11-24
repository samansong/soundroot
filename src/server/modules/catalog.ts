// Catalog module: beats, license tiers (immutable versions), discovery, producer catalog management.
import { z } from "zod";
import { all, insert, now, one, run, tx, uuid } from "../db.ts";
import { type Actor, hasRole, requireActor, requireRole } from "../auth.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { audit, notify } from "../audit.ts";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, MAX_ZIP_BYTES, putObject, signUrl, sniff } from "../storage.ts";
import { enqueue, registerJob } from "../queue.ts";
import { decodeWav, durationMs, encodeWav, makePreview, peaks } from "../audio/wav.ts";
import fs from "node:fs";
import { keyPath } from "../storage.ts";

export const TIERS = ["free", "basic", "premium", "unlimited", "exclusive"] as const;
export type Tier = (typeof TIERS)[number];

export interface LicenseTerms {
  summary: string;
  permittedUses: string[];
  distributionLimit: number | null; // copies/units; null = unlimited
  streamLimit: number | null;
  musicVideos: number | null;
  commercial: boolean;
  creditRequired: string;
  term: string;
  territory: string;
  includedFiles: ("mp3" | "wav" | "stems")[];
  exclusive: boolean;
}

export const COPYRIGHT_NOTICE =
  "This license grants usage rights only. It is not an assignment of copyright; the producer retains ownership of the composition and sound recording unless a separate written agreement says otherwise.";

export function defaultTerms(tier: Tier, producer: string): LicenseTerms {
  const credit = `Credit "Prod. by ${producer}" in titles and metadata`;
  switch (tier) {
    case "free":
      return { summary: "Promotional, non-commercial use", permittedUses: ["Non-profit performances", "Social media snippets", "Free mixtape"], distributionLimit: 0, streamLimit: 5000, musicVideos: 0, commercial: false, creditRequired: credit, term: "1 year", territory: "Worldwide", includedFiles: ["mp3"], exclusive: false };
    case "basic":
      return { summary: "Non-exclusive lease — tagged-free MP3", permittedUses: ["Streaming", "Digital sales", "Live performance"], distributionLimit: 2000, streamLimit: 100_000, musicVideos: 1, commercial: true, creditRequired: credit, term: "2 years", territory: "Worldwide", includedFiles: ["mp3"], exclusive: false };
    case "premium":
      return { summary: "Non-exclusive lease — studio WAV", permittedUses: ["Streaming", "Digital & physical sales", "Live performance", "Radio"], distributionLimit: 10_000, streamLimit: 500_000, musicVideos: 3, commercial: true, creditRequired: credit, term: "3 years", territory: "Worldwide", includedFiles: ["mp3", "wav"], exclusive: false };
    case "unlimited":
      return { summary: "Non-exclusive unlimited — WAV + trackouts", permittedUses: ["Streaming", "Digital & physical sales", "Live performance", "Radio", "Sync (non-broadcast)"], distributionLimit: null, streamLimit: null, musicVideos: null, commercial: true, creditRequired: credit, term: "10 years", territory: "Worldwide", includedFiles: ["mp3", "wav", "stems"], exclusive: false };
    case "exclusive":
      return { summary: "Exclusive rights — beat leaves the store", permittedUses: ["All commercial uses", "Broadcast & sync", "Unlimited distribution"], distributionLimit: null, streamLimit: null, musicVideos: null, commercial: true, creditRequired: credit, term: "Perpetual", territory: "Worldwide", includedFiles: ["mp3", "wav", "stems"], exclusive: true };
  }
}

const TIER_NAMES: Record<Tier, string> = { free: "Free promo", basic: "Basic lease", premium: "Premium lease", unlimited: "Unlimited lease", exclusive: "Exclusive" };

// ---------------- Discovery (BM-01)
export const searchSchema = z.object({
  q: z.string().max(80).optional(),
  genre: z.string().max(40).optional(),
  mood: z.string().max(40).optional(),
  key: z.string().max(20).optional(),
  bpmMin: z.coerce.number().int().min(40).max(220).optional(),
  bpmMax: z.coerce.number().int().min(40).max(220).optional(),
  priceMax: z.coerce.number().min(0).optional(), // major units
  producer: z.string().max(80).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "popular"]).default("newest"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

const PUBLIC_BEAT_COLS = `b.id, b.title, b.genre, b.mood, b.bpm, b.musical_key, b.hue, b.art_seed, b.status, b.plays,
  b.sales_count, b.published_at, b.duration_ms, b.waveform_json, b.preview_asset_id, b.description,
  p.id AS producer_id, p.display_name AS producer_name, p.slug AS producer_slug, p.hue AS producer_hue,
  (SELECT MIN(price_minor) FROM license_versions l WHERE l.beat_id=b.id AND l.is_current=1 AND l.tier!='free') AS from_minor,
  (SELECT COUNT(*) FROM license_versions l WHERE l.beat_id=b.id AND l.is_current=1 AND l.tier='free') AS has_free`;

export function searchBeats(input: unknown) {
  const f = searchSchema.parse(input);
  const where: string[] = ["b.status = 'published'"];
  const params: (string | number)[] = [];
  if (f.q) {
    where.push("(b.title LIKE ? OR p.display_name LIKE ? OR b.genre LIKE ? OR b.mood LIKE ?)");
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    params.push(like, like, like, like);
  }
  if (f.genre) { where.push("b.genre = ?"); params.push(f.genre); }
  if (f.mood) { where.push("b.mood = ?"); params.push(f.mood); }
  if (f.key) { where.push("b.musical_key = ?"); params.push(f.key); }
  if (f.bpmMin) { where.push("b.bpm >= ?"); params.push(f.bpmMin); }
  if (f.bpmMax) { where.push("b.bpm <= ?"); params.push(f.bpmMax); }
  if (f.producer) { where.push("p.slug = ?"); params.push(f.producer); }
  const having = f.priceMax !== undefined ? `WHERE from_minor <= ${Math.round(f.priceMax * 100)}` : "";
  const order = { newest: "published_at DESC", price_asc: "from_minor ASC", price_desc: "from_minor DESC", popular: "(sales_count * 20 + plays) DESC" }[f.sort];
  const base = `SELECT * FROM (SELECT ${PUBLIC_BEAT_COLS} FROM beats b JOIN producer_profiles p ON p.id=b.producer_id WHERE ${where.join(" AND ")}) ${having}`;
  const total = one<{ n: number }>(`SELECT COUNT(*) n FROM (${base})`, ...params)!.n;
  const rows = all(`${base} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, f.pageSize, (f.page - 1) * f.pageSize);
  return { items: rows.map(publicBeat), page: f.page, pageSize: f.pageSize, total, pages: Math.max(1, Math.ceil(total / f.pageSize)) };
}

export function publicBeat(b: any) {
  return {
    id: b.id,
    title: b.title,
    genre: b.genre,
    mood: b.mood,
    bpm: b.bpm,
    key: b.musical_key,
    hue: b.hue,
    artSeed: b.art_seed,
    status: b.status,
    plays: b.plays,
    sales: b.sales_count,
    description: b.description ?? "",
    durationMs: b.duration_ms,
    waveform: b.waveform_json ? (JSON.parse(b.waveform_json) as number[]) : null,
    previewUrl: b.preview_asset_id ? `/api/v1/beats/${b.id}/preview` : null,
    fromMinor: b.from_minor ?? null,
    hasFree: !!b.has_free,
    producer: { id: b.producer_id, name: b.producer_name, slug: b.producer_slug, hue: b.producer_hue },
  };
}
export type PublicBeat = ReturnType<typeof publicBeat>;

export function facets() {
  return {
    genres: all<{ genre: string; n: number }>("SELECT genre, COUNT(*) n FROM beats WHERE status='published' GROUP BY genre ORDER BY n DESC"),
    moods: all<{ mood: string }>("SELECT DISTINCT mood FROM beats WHERE status='published' AND mood!='' ORDER BY mood").map((r) => r.mood),
    keys: all<{ k: string }>("SELECT DISTINCT musical_key k FROM beats WHERE status='published' ORDER BY k").map((r) => r.k),
  };
}

export function getBeat(id: string, actor: Actor | null) {
  const b = one(`SELECT ${PUBLIC_BEAT_COLS}, p.user_id AS producer_user_id FROM beats b JOIN producer_profiles p ON p.id=b.producer_id WHERE b.id=?`, id);
  if (!b) throw notFound("Beat not found");
  const isOwner = actor && b.producer_user_id === actor.id;
  const isAdmin = actor && hasRole(actor, "admin");
  // Sold exclusives stay viewable (license records); drafts/taken down are owner/admin only.
  if (!["published", "exclusive_sold"].includes(b.status) && !isOwner && !isAdmin) throw notFound("Beat not found");
  const licenses = all("SELECT * FROM license_versions WHERE beat_id=? AND is_current=1 ORDER BY price_minor", id).map(publicLicense);
  const holdActive = !!one("SELECT 1 FROM beats WHERE id=? AND exclusive_hold_until > ?", id, now());
  return { ...publicBeat(b), licenses, exclusiveOnHold: holdActive, isOwner: !!isOwner };
}

export function publicLicense(l: any) {
  return { id: l.id, tier: l.tier as Tier, name: l.name, priceMinor: l.price_minor, currency: l.currency, version: l.version, terms: JSON.parse(l.terms_json) as LicenseTerms };
}

export function recordPlay(id: string) {
  run("UPDATE beats SET plays = plays + 1 WHERE id=? AND status='published'", id);
}

export function previewUrl(id: string) {
  const b = one("SELECT preview_asset_id, status FROM beats WHERE id=?", id);
  if (!b || !b.preview_asset_id || !["published", "exclusive_sold"].includes(b.status)) throw notFound("Preview unavailable");
  return signUrl(b.preview_asset_id, 60 * 30);
}

// ---------------- Producer profile & catalog (BM-02)
export function producerBySlug(slug: string) {
  const p = one("SELECT id, display_name, slug, bio, city, hue, created_at FROM producer_profiles WHERE slug=?", slug);
  if (!p) throw notFound("Producer not found");
  const stats = one("SELECT COUNT(*) beats, COALESCE(SUM(plays),0) plays FROM beats WHERE producer_id=? AND status='published'", p.id)!;
  return { ...p, stats };
}

export function ensureProducerProfile(actor: Actor, displayName?: string) {
  requireRole(actor, "beatmaker");
  const existing = one("SELECT id FROM producer_profiles WHERE user_id=?", actor.id);
  if (existing) return existing.id as string;
  const id = uuid();
  const base = (displayName || actor.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producer";
  let slug = base;
  for (let i = 2; one("SELECT 1 FROM producer_profiles WHERE slug=?", slug); i++) slug = `${base}-${i}`;
  insert("producer_profiles", { id, user_id: actor.id, display_name: displayName || actor.name, slug, hue: Math.floor(Math.random() * 360), created_at: now() });
  return id;
}

function ownBeat(actor: Actor | null, beatId: string) {
  const a = requireRole(actor, "beatmaker");
  const b = one("SELECT b.*, p.user_id FROM beats b JOIN producer_profiles p ON p.id=b.producer_id WHERE b.id=?", beatId);
  if (!b) throw notFound("Beat not found");
  if (b.user_id !== a.id) throw forbidden("You can only manage your own catalog");
  return { actor: a, beat: b };
}

export const beatInput = z.object({
  title: z.string().trim().min(2).max(80),
  genre: z.string().trim().min(2).max(40),
  mood: z.string().trim().max(40).default(""),
  bpm: z.coerce.number().int().min(40).max(220),
  key: z.string().trim().min(2).max(20),
  description: z.string().max(600).default(""),
});

export function createBeat(actorIn: Actor | null, input: unknown) {
  const actor = requireRole(actorIn, "beatmaker");
  const data = beatInput.parse(input);
  const producerId = ensureProducerProfile(actor);
  const id = uuid();
  insert("beats", {
    id, producer_id: producerId, title: data.title, genre: data.genre, mood: data.mood, bpm: data.bpm,
    musical_key: data.key, description: data.description, status: "draft",
    art_seed: Math.floor(Math.random() * 1e9), hue: Math.floor(Math.random() * 360), created_at: now(),
  });
  audit(actor.id, "beat.create", "beat", id);
  return { id };
}

export function updateBeat(actor: Actor | null, id: string, input: unknown) {
  const { beat } = ownBeat(actor, id);
  if (["exclusive_sold", "taken_down"].includes(beat.status)) throw conflict("This listing is locked");
  const d = beatInput.partial().parse(input);
  run(
    `UPDATE beats SET title=COALESCE(?,title), genre=COALESCE(?,genre), mood=COALESCE(?,mood), bpm=COALESCE(?,bpm),
     musical_key=COALESCE(?,musical_key), description=COALESCE(?,description) WHERE id=?`,
    d.title ?? null, d.genre ?? null, d.mood ?? null, d.bpm ?? null, d.key ?? null, d.description ?? null, id,
  );
}

export const licenseInput = z.array(
  z.object({ tier: z.enum(TIERS), enabled: z.boolean().default(true), price: z.coerce.number().min(0).max(1_000_000) }),
);

/** Each change creates a new immutable version; orders reference the exact version they bought. */
export function setLicenses(actorIn: Actor | null, beatId: string, input: unknown) {
  const { actor, beat } = ownBeat(actorIn, beatId);
  if (["exclusive_sold", "taken_down"].includes(beat.status)) throw conflict("This listing is locked");
  const tiers = licenseInput.parse(input);
  const producer = one("SELECT display_name FROM producer_profiles WHERE id=?", beat.producer_id)!.display_name;
  tx(() => {
    for (const t of tiers) {
      const cur = one("SELECT * FROM license_versions WHERE beat_id=? AND tier=? AND is_current=1", beatId, t.tier);
      const price = t.tier === "free" ? 0 : Math.round(t.price * 100);
      if (!t.enabled) {
        if (cur) run("UPDATE license_versions SET is_current=0 WHERE id=?", cur.id);
        continue;
      }
      if (t.tier !== "free" && price <= 0) throw badRequest(`${TIER_NAMES[t.tier]} needs a price`);
      if (cur && cur.price_minor === price) continue;
      if (cur) run("UPDATE license_versions SET is_current=0 WHERE id=?", cur.id);
      const maxV = one<{ v: number }>("SELECT COALESCE(MAX(version),0) v FROM license_versions WHERE beat_id=? AND tier=?", beatId, t.tier)!.v;
      insert("license_versions", {
        id: uuid(), beat_id: beatId, tier: t.tier, name: TIER_NAMES[t.tier], price_minor: price, currency: "GHS",
        terms_json: JSON.stringify(defaultTerms(t.tier, producer)), version: maxV + 1, is_current: 1, created_at: now(),
      });
    }
  });
  audit(actor.id, "beat.licenses", "beat", beatId, tiers);
}

export function attachBeatAudio(actorIn: Actor | null, beatId: string, kind: "master" | "stems", file: { name: string; type: string; data: Uint8Array }, clientPeaks?: number[]) {
  const { actor, beat } = ownBeat(actorIn, beatId);
  if (["exclusive_sold", "taken_down"].includes(beat.status)) throw conflict("This listing is locked");
  const sniffed = sniff(file.data);
  if (kind === "master") {
    if (!(file.type in AUDIO_TYPES) && !/\.(wav|mp3)$/i.test(file.name)) throw badRequest("Upload an MP3 or WAV file");
    if (sniffed !== "wav" && sniffed !== "mp3") throw badRequest("File contents are not valid MP3/WAV audio");
    if (file.data.byteLength > MAX_AUDIO_BYTES) throw badRequest("Audio exceeds the 120 MB limit");
  } else {
    if (sniffed !== "zip") throw badRequest("Stems must be a ZIP archive");
    if (file.data.byteLength > MAX_ZIP_BYTES) throw badRequest("Stems exceed the 500 MB limit");
  }
  const obj = putObject({ ownerId: actor.id, kind, filename: file.name, mime: sniffed === "wav" ? "audio/wav" : sniffed === "mp3" ? "audio/mpeg" : "application/zip", data: file.data });
  if (obj.scanStatus !== "clean") throw badRequest("File failed the security scan and was quarantined");
  if (kind === "stems") {
    run("UPDATE beats SET stems_asset_id=? WHERE id=?", obj.id, beatId);
  } else {
    const wf = clientPeaks && clientPeaks.length >= 20 && clientPeaks.length <= 400 ? JSON.stringify(clientPeaks.map((n) => Math.max(0, Math.min(1, Number(n) || 0)))) : null;
    run("UPDATE beats SET master_asset_id=?, processing_status='queued', waveform_json=COALESCE(?, waveform_json) WHERE id=?", obj.id, wf, beatId);
    enqueue("process_beat_audio", { beatId, assetId: obj.id });
  }
  audit(actor.id, `beat.upload.${kind}`, "beat", beatId, { assetId: obj.id, checksum: obj.checksum });
  return { assetId: obj.id, checksum: obj.checksum };
}

// Async worker: preview transcode + tag + waveform (BM-02)
registerJob("process_beat_audio", ({ beatId, assetId }: { beatId: string; assetId: string }) => {
  run("UPDATE beats SET processing_status='processing' WHERE id=?", beatId);
  const asset = one("SELECT * FROM assets WHERE id=?", assetId);
  if (!asset) throw new Error("asset missing");
  const bytes = fs.readFileSync(keyPath(asset.object_key));
  const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let previewId: string;
  let wf: string | null = null;
  let dur: number | null = null;
  if (asset.mime === "audio/wav") {
    const pcm = decodeWav(data);
    wf = JSON.stringify(peaks(pcm));
    dur = durationMs(pcm);
    const prev = makePreview(pcm);
    previewId = putObject({ ownerId: asset.owner_user_id, kind: "preview", filename: "preview.wav", mime: "audio/wav", data: encodeWav(prev) }).id;
  } else {
    // MP3 decoding requires the FFmpeg worker in production; dev serves the original as an untagged preview.
    previewId = assetId;
  }
  run(
    "UPDATE beats SET preview_asset_id=?, waveform_json=COALESCE(?, waveform_json), duration_ms=COALESCE(?, duration_ms), processing_status='ready' WHERE id=?",
    previewId, wf, dur, beatId,
  );
});

export function setBeatStatus(actorIn: Actor | null, id: string, action: "publish" | "unpublish" | "archive" | "draft", declareOwnership = false) {
  const { actor, beat } = ownBeat(actorIn, id);
  if (beat.status === "taken_down") throw conflict("This beat was taken down by moderation. Contact support to resolve.");
  if (beat.status === "exclusive_sold") throw conflict("Exclusive-sold listings cannot be republished without authorized resolution");
  if (action === "publish") {
    if (declareOwnership) run("UPDATE beats SET ownership_declared_at=? WHERE id=?", now(), id);
    const fresh = one("SELECT * FROM beats WHERE id=?", id)!;
    if (!fresh.ownership_declared_at) throw badRequest("Confirm you own or control all rights in this beat before publishing");
    if (!fresh.master_asset_id) throw badRequest("Upload the beat audio before publishing");
    if (fresh.processing_status !== "ready") throw conflict("Audio is still processing — try again in a moment");
    const n = one<{ n: number }>("SELECT COUNT(*) n FROM license_versions WHERE beat_id=? AND is_current=1", id)!.n;
    if (!n) throw badRequest("Add at least one license tier");
    const lic = all("SELECT tier FROM license_versions WHERE beat_id=? AND is_current=1", id).map((l) => l.tier);
    if ((lic.includes("unlimited") || lic.includes("exclusive")) && !fresh.stems_asset_id) {
      // Stems are optional at upload but required for tiers that promise them.
      throw badRequest("Unlimited/Exclusive tiers include stems — upload a stems ZIP or disable those tiers");
    }
    run("UPDATE beats SET status='published', published_at=COALESCE(published_at, ?) WHERE id=?", now(), id);
  } else {
    const to = action === "unpublish" ? "unpublished" : action === "archive" ? "archived" : "draft";
    run("UPDATE beats SET status=? WHERE id=?", to, id);
  }
  audit(actor.id, `beat.${action}`, "beat", id);
}

export function myCatalog(actorIn: Actor | null) {
  const actor = requireRole(actorIn, "beatmaker");
  const p = one("SELECT * FROM producer_profiles WHERE user_id=?", actor.id);
  if (!p) return { profile: null, beats: [], stats: { published: 0, sales: 0, netMinor: 0, pendingMinor: 0 } };
  const beats = all(
    `SELECT b.*, (SELECT MIN(price_minor) FROM license_versions l WHERE l.beat_id=b.id AND l.is_current=1 AND l.tier!='free') from_minor
     FROM beats b WHERE producer_id=? AND status != 'archived' ORDER BY created_at DESC`,
    p.id,
  ).map((b) => ({
    id: b.id, title: b.title, genre: b.genre, bpm: b.bpm, key: b.musical_key, status: b.status, hue: b.hue, artSeed: b.art_seed,
    fromMinor: b.from_minor, plays: b.plays, sales: b.sales_count, processing: b.processing_status,
    hasAudio: !!b.master_asset_id, hasStems: !!b.stems_asset_id, ownershipDeclared: !!b.ownership_declared_at,
    waveform: b.waveform_json ? JSON.parse(b.waveform_json) : null,
    licenses: all("SELECT tier, price_minor FROM license_versions WHERE beat_id=? AND is_current=1", b.id),
  }));
  const net = one<{ v: number }>("SELECT COALESCE(SUM(amount_minor),0) v FROM ledger_entries WHERE account=? AND entry_type IN ('seller_payable','refund')", `seller:${actor.id}`)!.v;
  const paidOut = one<{ v: number }>("SELECT COALESCE(SUM(amount_minor),0) v FROM payouts WHERE user_id=? AND status!='failed'", actor.id)!.v;
  const sales = one<{ n: number }>(
    "SELECT COUNT(*) n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.seller_user_id=? AND o.kind='beat' AND o.status IN ('paid','partially_refunded')",
    actor.id,
  )!.n;
  return {
    profile: { id: p.id, displayName: p.display_name, slug: p.slug, bio: p.bio, city: p.city, payoutVerified: !!p.payout_verified },
    beats,
    stats: { published: beats.filter((b) => b.status === "published").length, sales, netMinor: net, availableMinor: net - paidOut },
  };
}

export function updateProducerProfile(actorIn: Actor | null, input: unknown) {
  const actor = requireRole(actorIn, "beatmaker");
  const d = z.object({ displayName: z.string().trim().min(2).max(60), bio: z.string().max(500).default(""), city: z.string().max(60).default("") }).parse(input);
  const id = ensureProducerProfile(actor, d.displayName);
  run("UPDATE producer_profiles SET display_name=?, bio=?, city=? WHERE id=?", d.displayName, d.bio, d.city, id);
}

// ---------------- Trust & moderation (BM-06)
export function reportBeat(actor: Actor | null, beatId: string, reason: string) {
  const a = requireActor(actor);
  if (!one("SELECT 1 FROM beats WHERE id=?", beatId)) throw notFound();
  const r = z.string().trim().min(10, "Describe the issue (10+ characters)").max(1000).parse(reason);
  insert("reports", { id: uuid(), reporter_id: a.id, beat_id: beatId, reason: r, status: "open", created_at: now() });
  for (const admin of all("SELECT user_id FROM user_roles WHERE role='admin'")) notify(admin.user_id, "moderation", "New infringement report", r.slice(0, 120), "/admin");
  audit(a.id, "beat.report", "beat", beatId);
}
