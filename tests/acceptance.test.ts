// Acceptance scenarios from spec §15, run against an isolated temp database.
// Run: npm test
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "soundroot-test-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.STORAGE_DIR = path.join(tmp, "storage");
(process.env as Record<string, string>).NODE_ENV = "test";

const { one, all, run } = await import("../src/server/db.ts");
const { newUser, loadActor } = await import("../src/server/auth.ts");
const { encodeWav } = await import("../src/server/audio/wav.ts");
const catalog = await import("../src/server/modules/catalog.ts");
const billing = await import("../src/server/modules/billing.ts");
const studio = await import("../src/server/modules/studio.ts");
const projects = await import("../src/server/modules/projects.ts");
const { tick } = await import("../src/server/queue.ts");
const { AppError } = await import("../src/server/errors.ts");

const pw = "test-password-123";
const mk = (email: string, roles: any[]) => loadActor(newUser({ email, name: email.split("@")[0], password: pw, roles }))!;
const fresh = (a: { id: string }) => loadActor(a.id)!;
const wav = () => {
  const n = 22050 * 3;
  const ch = new Float32Array(n).map((_, i) => 0.4 * Math.sin((2 * Math.PI * 220 * i) / 22050) * (1 - i / n));
  return encodeWav({ sampleRate: 22050, channels: [ch, ch] });
};
const zip = () => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(40).fill(0)]);
async function drain() { while (one("SELECT 1 FROM jobs WHERE status='queued'")) await tick(); }
const rejects = (fn: () => unknown, status: number) => assert.throws(fn, (e: any) => e instanceof AppError && e.status === status, `expected HTTP ${status}`);

function pay(orderId: string, buyer: any) {
  const { providerRef } = billing.startCheckout(buyer, { orderId, idempotencyKey: crypto.randomUUID() });
  const p = one("SELECT amount_minor, currency FROM payments WHERE provider_ref=?", providerRef);
  const body = JSON.stringify({ id: `evt_${crypto.randomUUID()}`, type: "charge.succeeded", data: { reference: providerRef, amount: p.amount_minor, currency: p.currency, fee: 10 } });
  return { body, sig: billing.signPayload(body), result: billing.handlePaymentWebhook(body, billing.signPayload(body)) };
}

let producer: any, buyerA: any, buyerB: any, beatId: string;
before(async () => {
  producer = mk("prod@test.dev", ["beatmaker"]);
  catalog.ensureProducerProfile(producer);
  producer = fresh(producer);
  buyerA = mk("a@test.dev", ["artist"]);
  buyerB = mk("b@test.dev", ["artist"]);
  beatId = catalog.createBeat(producer, { title: "Test Beat", genre: "Afrobeats", bpm: 100, key: "A minor" }).id;
  catalog.attachBeatAudio(producer, beatId, "master", { name: "t.wav", type: "audio/wav", data: wav() });
  catalog.attachBeatAudio(producer, beatId, "stems", { name: "s.zip", type: "application/zip", data: zip() });
  catalog.setLicenses(producer, beatId, [{ tier: "basic", enabled: true, price: 100 }, { tier: "exclusive", enabled: true, price: 2000 }]);
  await drain();
  catalog.setBeatStatus(producer, beatId, "publish", true);
});

const lic = (tier: string) => one("SELECT id FROM license_versions WHERE beat_id=? AND tier=? AND is_current=1", beatId, tier).id as string;

test("Beat purchase: verified payment issues immutable license and authorized download", () => {
  const { orderId } = billing.createBeatOrder(buyerA, { licenseVersionId: lic("basic"), acceptTerms: true });
  // Before payment: no download, no license PDF.
  rejects(() => billing.licenseDocument(buyerA, orderId), 403);
  pay(orderId, buyerA);
  const o = billing.getOrder(buyerA, orderId);
  assert.equal(o.status, "paid");
  const asset = o.items[0].entitlement!.assets[0] as any;
  assert.ok(billing.downloadBeatAsset(buyerA, asset.id).url.includes("sig="));
  rejects(() => billing.downloadBeatAsset(buyerB, asset.id), 403);
  // License snapshot is immutable: changing the price later creates a new version, old order keeps v1.
  catalog.setLicenses(producer, beatId, [{ tier: "basic", enabled: true, price: 150 }]);
  assert.equal(billing.getOrder(buyerA, orderId).items[0].license.version, 1);
  assert.ok(billing.licenseDocument(buyerA, orderId).pdf.byteLength > 500);
  // Another user can't even see the order.
  rejects(() => billing.getOrder(buyerB, orderId), 404);
});

test("Server computes totals and rejects stale license versions", () => {
  const stale = one("SELECT id FROM license_versions WHERE beat_id=? AND tier='basic' AND is_current=0", beatId).id;
  rejects(() => billing.createBeatOrder(buyerA, { licenseVersionId: stale, acceptTerms: true }), 409);
  assert.throws(() => billing.createBeatOrder(buyerA, { licenseVersionId: lic("basic"), acceptTerms: false }));
});

test("Webhook replay: duplicate event produces no duplicate entitlement or ledger entry; forged/mismatched events rejected", () => {
  const { orderId } = billing.createBeatOrder(buyerB, { licenseVersionId: lic("basic"), acceptTerms: true });
  const { body, sig } = pay(orderId, buyerB);
  const ledgerBefore = all("SELECT id FROM ledger_entries WHERE order_id=?", orderId).length;
  assert.deepEqual(billing.handlePaymentWebhook(body, sig), { duplicate: true });
  assert.equal(all("SELECT id FROM ledger_entries WHERE order_id=?", orderId).length, ledgerBefore);
  assert.equal(all("SELECT e.id FROM entitlements e JOIN order_items oi ON oi.id=e.order_item_id WHERE oi.order_id=?", orderId).length, 1);
  rejects(() => billing.handlePaymentWebhook(body, "0".repeat(64)), 401);
  // Amount tampering is refused even with a valid signature.
  const o2 = billing.createBeatOrder(buyerB, { licenseVersionId: lic("basic"), acceptTerms: true }).orderId;
  const { providerRef } = billing.startCheckout(buyerB, { orderId: o2, idempotencyKey: crypto.randomUUID() });
  const evil = JSON.stringify({ id: "evt_evil", type: "charge.succeeded", data: { reference: providerRef, amount: 1, currency: "GHS" } });
  rejects(() => billing.handlePaymentWebhook(evil, billing.signPayload(evil)), 400);
  assert.notEqual(billing.getOrder(buyerB, o2).status, "paid");
});

test("Checkout idempotency key returns the same provider session", () => {
  const { orderId } = billing.createBeatOrder(buyerA, { licenseVersionId: lic("basic"), acceptTerms: true });
  const a = billing.startCheckout(buyerA, { orderId, idempotencyKey: "same-key-123" });
  const b = billing.startCheckout(buyerA, { orderId, idempotencyKey: "same-key-123" });
  assert.equal(a.providerRef, b.providerRef);
});

test("Exclusive concurrency: two simultaneous buyers cannot both obtain the exclusive license", () => {
  const first = billing.createBeatOrder(buyerA, { licenseVersionId: lic("exclusive"), acceptTerms: true });
  rejects(() => billing.createBeatOrder(buyerB, { licenseVersionId: lic("exclusive"), acceptTerms: true }), 409);
  pay(first.orderId, buyerA);
  const b = one("SELECT status FROM beats WHERE id=?", beatId);
  assert.equal(b.status, "exclusive_sold");
  rejects(() => billing.createBeatOrder(buyerB, { licenseVersionId: lic("basic"), acceptTerms: true }), 409);
  // Existing non-exclusive licenses remain valid; the listing can't be republished.
  assert.ok(all("SELECT id FROM entitlements WHERE beat_id=? AND revoked_at IS NULL", beatId).length >= 3);
  rejects(() => catalog.setBeatStatus(producer, beatId, "publish"), 409);
});

// ---------------- Studio
let owner: any, ownerB: any, eng: any, engB: any, studioId: string, studioB: string, roomId: string, serviceId: string, artist: any;
test("Studio fixtures", () => {
  owner = mk("owner@test.dev", ["studio_owner"]);
  ownerB = mk("ownerb@test.dev", ["studio_owner"]);
  eng = mk("eng@test.dev", ["engineer"]);
  engB = mk("engb@test.dev", ["engineer"]);
  artist = mk("artist@test.dev", ["artist"]);
  const now = new Date().toISOString();
  const mkStudio = (o: any, name: string) => {
    const id = crypto.randomUUID();
    run("INSERT INTO studios (id, owner_user_id, name, slug, timezone, open_hour, close_hour, deposit_pct, created_at) VALUES (?,?,?,?, 'Africa/Accra', 0, 24, 30, ?)", id, o.id, name, name.toLowerCase(), now);
    run("INSERT INTO memberships (id, studio_id, user_id, role, can_view_finance, created_at) VALUES (?,?,?,'owner',1,?)", crypto.randomUUID(), id, o.id, now);
    return id;
  };
  studioId = mkStudio(owner, "A");
  studioB = mkStudio(ownerB, "B");
  roomId = crypto.randomUUID();
  run("INSERT INTO rooms (id, studio_id, name) VALUES (?,?, 'Room 1')", roomId, studioId);
  run("INSERT INTO rooms (id, studio_id, name) VALUES (?,?, 'Room 2')", crypto.randomUUID(), studioId);
  serviceId = crypto.randomUUID();
  run("INSERT INTO services (id, studio_id, name, duration_min, rate_minor) VALUES (?,?, 'Session', 120, 40000)", serviceId, studioId);
  run("INSERT INTO memberships (id, studio_id, user_id, role, created_at) VALUES (?,?,?,'engineer',?)", crypto.randomUUID(), studioId, eng.id, now);
  run("INSERT INTO memberships (id, studio_id, user_id, role, created_at) VALUES (?,?,?,'engineer',?)", crypto.randomUUID(), studioB, engB.id, now);
  owner = fresh(owner); ownerB = fresh(ownerB); eng = fresh(eng); engB = fresh(engB);
});

test("Booking collision: overlapping room/engineer holds or reservations cannot both succeed", () => {
  const start = new Date(Date.now() + 3 * 86400_000);
  start.setUTCHours(10, 0, 0, 0);
  const hold = studio.createBookingHold(artist, { studioId, serviceId, roomId, startsAt: start.toISOString(), engineerId: eng.id });
  assert.ok(hold.orderId);
  assert.equal(hold.depositMinor, 12000);
  const overlap = new Date(start.getTime() + 60 * 60000).toISOString();
  rejects(() => studio.createBookingHold(buyerA, { studioId, serviceId, roomId, startsAt: overlap }), 409);
  // Same engineer in a different room at the same time is also a collision.
  const room2 = one("SELECT id FROM rooms WHERE studio_id=? AND id != ?", studioId, roomId).id;
  rejects(() => studio.createBookingHold(buyerA, { studioId, serviceId, roomId: room2, startsAt: start.toISOString(), engineerId: eng.id }), 409);
  // Back-to-back is fine.
  assert.ok(studio.createBookingHold(buyerA, { studioId, serviceId, roomId, startsAt: new Date(start.getTime() + 120 * 60000).toISOString() }).orderId);
  // Availability no longer offers the held slot.
  const slots = studio.availability(studioId, { date: start.toISOString().slice(0, 10), serviceId, roomId }).slots.map((s) => s.startsAt);
  assert.ok(!slots.includes(start.toISOString()));
  // Paying the deposit confirms the booking.
  pay(hold.orderId, artist);
  assert.equal(one("SELECT status FROM bookings WHERE id=?", hold.bookingId).status, "confirmed");
});

test("Tenant isolation: staff cannot access another studio's clients, files or revenue", () => {
  rejects(() => studio.listClients(engB, studioId), 403);
  rejects(() => studio.studioReport(ownerB, studioId, { from: "2020-01-01", to: "2030-01-01" }), 403);
  rejects(() => studio.studioReport(eng, studioId, { from: "2020-01-01", to: "2030-01-01" }), 403); // engineer without finance grant
  rejects(() => studio.calendar(ownerB, studioId, { from: "2026-01-01" }), 403);
  const b = one("SELECT id FROM bookings WHERE studio_id=? LIMIT 1", studioId).id;
  rejects(() => studio.patchBooking(ownerB, b, { action: "cancel" }), 404);
});

let projectId: string, versionId: string;
test("Project review: comments bind to version and timestamp; approval is auditable; delivery gated on payment", () => {
  const clientId = studio.upsertClient(owner, studioId, { name: "Artist" }).id;
  run("UPDATE clients SET user_id=? WHERE id=?", artist.id, clientId);
  projectId = projects.createProject(owner, { studioId, title: "Song", clientId, engineerId: eng.id, priceMajor: 500 }).id;
  rejects(() => projects.getProject(engB, projectId), 404);
  rejects(() => projects.addVersion(artist, projectId, { name: "x.wav", type: "audio/wav", data: wav() }, {}), 403);
  versionId = projects.addVersion(eng, projectId, { name: "mix.wav", type: "audio/wav", data: wav() }, { label: "Mix v1" }).id;
  projects.addComment(artist, versionId, { body: "Vocals up here", timestampMs: 1500 });
  const c = one("SELECT version_id, timestamp_ms FROM comments WHERE body='Vocals up here'");
  assert.deepEqual([c.version_id, c.timestamp_ms], [versionId, 1500]);
  rejects(() => projects.addComment(artist, versionId, { body: "past the end", timestampMs: 999_000 }), 400);
  rejects(() => projects.approveVersion(eng, versionId), 403);
  rejects(() => projects.finalize(eng, projectId, versionId), 409); // not yet approved
  projects.approveVersion(artist, versionId);
  assert.ok(one("SELECT 1 FROM audit_events WHERE action='project.approve' AND resource_id=?", versionId));
  projects.finalize(eng, projectId, versionId);
  const assetId = one("SELECT asset_id FROM audio_versions WHERE id=?", versionId).asset_id;
  // Final delivery: unpaid → forbidden; outsider → not found; after verified payment → signed URL.
  rejects(() => projects.downloadDeliverable(artist, projectId, assetId), 403);
  rejects(() => projects.downloadDeliverable(buyerB, projectId, assetId), 404);
  const { orderId } = billing.createProjectOrder(artist, projectId);
  pay(orderId, artist);
  assert.ok(projects.downloadDeliverable(artist, projectId, assetId).url.includes("attachment"));
  assert.equal(one("SELECT status FROM projects WHERE id=?", projectId).status, "delivered");
});

test("Staff revocation is immediate", () => {
  const m = one("SELECT id FROM memberships WHERE studio_id=? AND user_id=?", studioId, eng.id).id;
  studio.updateMember(owner, studioId, m, { action: "revoke" });
  rejects(() => projects.getProject(fresh(eng), projectId), 404);
  rejects(() => studio.calendar(fresh(eng), studioId, { from: "2026-01-01" }), 403);
});

test("Refund and dispute: correct status, ledger adjustments and access revoked", () => {
  const admin = mk("admin@test.dev", ["admin"]);
  const order = one("SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.buyer_id=? AND o.status='paid' AND oi.beat_id IS NOT NULL LIMIT 1", buyerB.id).id;
  billing.openDispute(buyerB, order, "The files were corrupted on download");
  assert.equal(billing.getOrder(buyerB, order).status, "disputed");
  const d = one("SELECT id FROM disputes WHERE order_id=?", order).id;
  billing.resolveDispute(admin, d, "refund", "Refunded");
  const o = billing.getOrder(buyerB, order);
  assert.equal(o.status, "refunded");
  assert.equal(o.items[0].entitlement, null);
  const net = one("SELECT SUM(amount_minor) v FROM ledger_entries WHERE order_id=? AND entry_type IN ('collected','collected_refund')", order).v;
  assert.equal(net, 0);
});
