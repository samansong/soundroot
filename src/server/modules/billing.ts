// Billing module: orders, provider checkout, webhook reconciliation, ledger, entitlements,
// downloads, refunds/disputes and payouts. Implements BM-04, BM-05 and spec §13.
import crypto from "node:crypto";
import { z } from "zod";
import { addMinutes, all, insert, now, one, run, tx, uuid } from "../db.ts";
import { type Actor, hasRole, requireActor, requireRole } from "../auth.ts";
import { AppError, badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { audit, notify } from "../audit.ts";
import { BEAT_COMMISSION_BPS, BOOKING_COMMISSION_BPS, PROVIDER_FEE_BPS, bps, formatMoney } from "../money.ts";
import { signUrl } from "../storage.ts";
import { registerJob, registerSweep, enqueue } from "../queue.ts";
import { COPYRIGHT_NOTICE, type LicenseTerms } from "./catalog.ts";

const ORDER_TTL_MIN = 20;
const PROVIDER = "sandboxpay";
const webhookSecret = () => process.env.PAYMENT_WEBHOOK_SECRET || "dev-webhook-secret-change-me";
const ref = (p: string) => `${p}_${crypto.randomBytes(9).toString("base64url")}`;
const orderRef = () => `SR-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

// ---------------- Orders
export function createBeatOrder(actorIn: Actor | null, input: unknown) {
  const actor = requireActor(actorIn);
  const { licenseVersionId, acceptTerms } = z.object({ licenseVersionId: z.string().uuid(), acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the license terms" }) }) }).parse(input);

  return tx(() => {
    // Server-side price + availability validation: never trust client-sent amounts.
    const lic = one("SELECT * FROM license_versions WHERE id=?", licenseVersionId);
    if (!lic || !lic.is_current) throw conflict("This license has changed — refresh to see current terms", "license_stale");
    const beat = one("SELECT b.*, p.user_id seller_id, p.display_name producer FROM beats b JOIN producer_profiles p ON p.id=b.producer_id WHERE b.id=?", lic.beat_id)!;
    if (beat.status !== "published") throw conflict("This beat is no longer available");
    if (beat.seller_id === actor.id) throw badRequest("You can't buy your own beat");

    const orderId = uuid();
    const expires = addMinutes(new Date(), ORDER_TTL_MIN);
    if (lic.tier === "exclusive") {
      // BM-05: atomic conditional reservation. Exactly one concurrent buyer can win the hold.
      const r = run(
        `UPDATE beats SET exclusive_hold_order_id=?, exclusive_hold_until=?
         WHERE id=? AND status='published' AND (exclusive_hold_until IS NULL OR exclusive_hold_until < ?)`,
        orderId, expires, beat.id, now(),
      );
      if (Number(r.changes) !== 1) throw conflict("Another buyer is checking out this exclusive right now. Try again in a few minutes.", "exclusive_held");
    }
    const free = lic.price_minor === 0;
    insert("orders", {
      id: orderId, reference: orderRef(), buyer_id: actor.id, kind: "beat", status: free ? "paid" : "pending",
      total_minor: lic.price_minor, currency: lic.currency, expires_at: free ? null : expires, created_at: now(), paid_at: free ? now() : null,
    });
    const itemId = uuid();
    insert("order_items", {
      id: itemId, order_id: orderId, beat_id: beat.id, license_version_id: lic.id, seller_user_id: beat.seller_id,
      description: `${beat.title} — ${lic.name} (v${lic.version})`, price_minor: lic.price_minor,
      // Immutable snapshot of exactly what was accepted.
      license_snapshot_json: JSON.stringify({ licenseVersionId: lic.id, tier: lic.tier, name: lic.name, version: lic.version, terms: JSON.parse(lic.terms_json), beat: { id: beat.id, title: beat.title, producer: beat.producer, bpm: beat.bpm, key: beat.musical_key }, copyrightNotice: COPYRIGHT_NOTICE }),
      terms_accepted_at: now(),
    });
    audit(actor.id, "order.create", "order", orderId, { licenseVersionId, accepted: true });
    if (free) grantEntitlements(orderId);
    return { orderId, free };
  });
}

export function createProjectOrder(actorIn: Actor | null, projectId: string) {
  const actor = requireActor(actorIn);
  const p = one("SELECT * FROM projects WHERE id=?", projectId);
  if (!p) throw notFound();
  if (!one("SELECT 1 FROM project_members WHERE project_id=? AND user_id=? AND role='artist'", projectId, actor.id)) throw forbidden("Only the project artist can pay this balance");
  const due = p.price_minor - p.paid_minor;
  if (due <= 0) throw badRequest("Nothing to pay — this project is settled");
  const studio = one("SELECT owner_user_id, name FROM studios WHERE id=?", p.studio_id)!;
  const existing = one("SELECT id FROM orders WHERE project_id=? AND buyer_id=? AND status='pending' AND total_minor=?", projectId, actor.id, due);
  if (existing) return { orderId: existing.id as string };
  const orderId = uuid();
  insert("orders", { id: orderId, reference: orderRef(), buyer_id: actor.id, kind: "project", status: "pending", total_minor: due, currency: "GHS", project_id: projectId, expires_at: addMinutes(new Date(), 60 * 24), created_at: now() });
  insert("order_items", { id: uuid(), order_id: orderId, seller_user_id: studio.owner_user_id, description: `${p.title} — project balance (${studio.name})`, price_minor: due });
  return { orderId };
}

/** Called by booking module inside its transaction. */
export function createBookingOrderTx(buyerId: string, bookingId: string, amountMinor: number, description: string, sellerUserId: string, holdExpires: string) {
  const orderId = uuid();
  insert("orders", { id: orderId, reference: orderRef(), buyer_id: buyerId, kind: "booking", status: "pending", total_minor: amountMinor, currency: "GHS", booking_id: bookingId, expires_at: holdExpires, created_at: now() });
  insert("order_items", { id: uuid(), order_id: orderId, seller_user_id: sellerUserId, description, price_minor: amountMinor });
  return orderId;
}

export function getOrder(actorIn: Actor | null, id: string) {
  const actor = requireActor(actorIn);
  const o = one("SELECT * FROM orders WHERE id=?", id);
  if (!o) throw notFound("Order not found");
  if (o.buyer_id !== actor.id && !hasRole(actor, "admin")) throw notFound("Order not found");
  const items = all("SELECT * FROM order_items WHERE order_id=?", id).map((i) => ({
    id: i.id, description: i.description, priceMinor: i.price_minor, beatId: i.beat_id,
    license: i.license_snapshot_json ? JSON.parse(i.license_snapshot_json) : null,
    entitlement: one("SELECT id, asset_ids_json, revoked_at FROM entitlements WHERE order_item_id=?", i.id) ?? null,
  }));
  const payments = all("SELECT provider_ref, amount_minor, status, method, created_at FROM payments WHERE order_id=? ORDER BY created_at", id);
  return {
    id: o.id, reference: o.reference, kind: o.kind, status: o.status, totalMinor: o.total_minor, currency: o.currency,
    createdAt: o.created_at, paidAt: o.paid_at, expiresAt: o.expires_at, bookingId: o.booking_id, projectId: o.project_id,
    items: items.map((i) => ({
      ...i,
      entitlement: i.entitlement && !i.entitlement.revoked_at ? { id: i.entitlement.id, assets: assetList(JSON.parse(i.entitlement.asset_ids_json)) } : null,
    })),
    payments,
    dispute: one("SELECT status, reason, resolution FROM disputes WHERE order_id=?", id) ?? null,
  };
}

function assetList(ids: string[]) {
  return ids.map((aid) => {
    const a = one("SELECT id, kind, filename, size FROM assets WHERE id=?", aid);
    return a ? { id: a.id, kind: a.kind, filename: a.filename, size: a.size } : null;
  }).filter(Boolean);
}

export function myOrders(actorIn: Actor | null) {
  const actor = requireActor(actorIn);
  return all(
    `SELECT o.id, o.reference, o.kind, o.status, o.total_minor, o.created_at, o.paid_at,
       (SELECT description FROM order_items WHERE order_id=o.id LIMIT 1) description,
       (SELECT beat_id FROM order_items WHERE order_id=o.id LIMIT 1) beat_id,
       (SELECT b.hue FROM order_items oi JOIN beats b ON b.id=oi.beat_id WHERE oi.order_id=o.id LIMIT 1) hue,
       (SELECT b.art_seed FROM order_items oi JOIN beats b ON b.id=oi.beat_id WHERE oi.order_id=o.id LIMIT 1) art_seed
     FROM orders o WHERE buyer_id=? ORDER BY created_at DESC LIMIT 100`,
    actor.id,
  );
}

// ---------------- Checkout (provider session with idempotency key)
export function startCheckout(actorIn: Actor | null, input: unknown) {
  const actor = requireActor(actorIn);
  const { orderId, idempotencyKey, method } = z.object({ orderId: z.string().uuid(), idempotencyKey: z.string().min(8).max(80), method: z.enum(["momo", "card"]).default("momo") }).parse(input);
  const prior = one("SELECT * FROM payments WHERE idempotency_key=?", `${actor.id}:${idempotencyKey}`);
  if (prior) return { providerRef: prior.provider_ref, checkoutUrl: `/pay/${prior.provider_ref}` };
  const o = one("SELECT * FROM orders WHERE id=?", orderId);
  if (!o || o.buyer_id !== actor.id) throw notFound("Order not found");
  if (o.status !== "pending") throw conflict(`Order is ${o.status}`);
  if (o.expires_at && o.expires_at < now()) throw conflict("This checkout expired — start again", "order_expired");
  const providerRef = ref("sp");
  insert("payments", {
    id: uuid(), order_id: orderId, provider: PROVIDER, provider_ref: providerRef, idempotency_key: `${actor.id}:${idempotencyKey}`,
    amount_minor: o.total_minor, currency: o.currency, method, status: "pending", created_at: now(), updated_at: now(),
  });
  run("UPDATE orders SET status='processing' WHERE id=? AND status='pending'", orderId);
  return { providerRef, checkoutUrl: `/pay/${providerRef}` };
}

/** Data for the sandbox provider's hosted page. */
export function providerSession(providerRef: string) {
  const p = one("SELECT p.*, o.reference, o.kind, o.expires_at FROM payments p JOIN orders o ON o.id=p.order_id WHERE provider_ref=?", providerRef);
  if (!p) throw notFound("Payment session not found");
  const desc = one("SELECT description FROM order_items WHERE order_id=? LIMIT 1", p.order_id)?.description ?? "";
  return { providerRef, orderId: p.order_id, reference: p.reference, amountMinor: p.amount_minor, currency: p.currency, method: p.method, status: p.status, description: desc, kind: p.kind };
}

// ---------------- Sandbox provider → webhook (simulates a licensed PSP such as a MoMo/card aggregator)
export function signPayload(body: string) {
  return crypto.createHmac("sha256", webhookSecret()).update(body).digest("hex");
}

export function sandboxAuthorize(providerRef: string, outcome: "succeed" | "fail", origin: string) {
  const p = one("SELECT * FROM payments WHERE provider_ref=?", providerRef);
  if (!p) throw notFound();
  if (p.status !== "pending") throw conflict(`Payment already ${p.status}`);
  const event = {
    id: ref("evt"),
    type: outcome === "succeed" ? "charge.succeeded" : "charge.failed",
    created: Math.floor(Date.now() / 1000),
    data: { reference: providerRef, amount: p.amount_minor, currency: p.currency, channel: p.method, fee: bps(p.amount_minor, PROVIDER_FEE_BPS) },
  };
  // The provider delivers webhooks asynchronously with retries (durable queue).
  enqueue("deliver_webhook", { url: `${origin}/api/v1/webhooks/payments`, body: JSON.stringify(event) });
  return { eventId: event.id };
}

registerJob("deliver_webhook", async ({ url, body }: { url: string; body: string }) => {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-sandboxpay-signature": signPayload(body) }, body });
  if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
});

const eventSchema = z.object({
  id: z.string(),
  type: z.enum(["charge.succeeded", "charge.failed", "charge.refunded", "charge.disputed"]),
  data: z.object({ reference: z.string(), amount: z.number().int(), currency: z.string(), channel: z.string().optional(), fee: z.number().int().optional() }),
});

/** Webhooks are authoritative only after signature + amount/currency verification. Replays are no-ops. */
export function handlePaymentWebhook(rawBody: string, signature: string | null) {
  const expected = signPayload(rawBody);
  if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError(401, "bad_signature", "Invalid webhook signature");
  }
  const event = eventSchema.parse(JSON.parse(rawBody));
  return tx(() => {
    const seen = one("SELECT processed_at FROM webhook_events WHERE id=?", event.id);
    if (seen) return { duplicate: true };
    insert("webhook_events", { id: event.id, type: event.type, payload: rawBody, received_at: now() });
    const pay = one("SELECT * FROM payments WHERE provider_ref=?", event.data.reference);
    if (!pay) throw notFound("Unknown payment reference");
    if (pay.amount_minor !== event.data.amount || pay.currency !== event.data.currency) {
      audit(null, "payment.mismatch", "payment", pay.id, event);
      throw badRequest("Amount/currency mismatch — flagged for reconciliation");
    }
    const order = one("SELECT * FROM orders WHERE id=?", pay.order_id)!;
    if (event.type === "charge.succeeded") {
      if (pay.status === "paid") return { duplicate: true };
      run("UPDATE payments SET status='paid', updated_at=? WHERE id=?", now(), pay.id);
      if (order.status === "expired" || order.status === "failed") {
        // Paid after expiry: record cash, flag for refund rather than fulfilling stale inventory.
        writeLedger(order, pay.id, event.data.fee ?? 0);
        audit(null, "payment.late", "order", order.id);
        for (const admin of all("SELECT user_id FROM user_roles WHERE role='admin'")) notify(admin.user_id, "finance", "Late payment needs refund", order.reference, "/admin");
      } else {
        run("UPDATE orders SET status='paid', paid_at=? WHERE id=?", now(), order.id);
        writeLedger(order, pay.id, event.data.fee ?? 0);
        fulfil(order);
      }
    } else if (event.type === "charge.failed") {
      run("UPDATE payments SET status='failed', updated_at=? WHERE id=?", now(), pay.id);
      if (["pending", "processing"].includes(order.status)) {
        run("UPDATE orders SET status='pending' WHERE id=?", order.id); // buyer may retry until expiry
        notify(order.buyer_id, "payment", "Payment failed", `Payment for ${order.reference} did not go through. You can retry before the hold expires.`, `/orders/${order.id}`);
      }
    }
    run("UPDATE webhook_events SET processed_at=? WHERE id=?", now(), event.id);
    return { duplicate: false };
  });
}

function writeLedger(order: any, paymentId: string, providerFee: number) {
  const items = all("SELECT * FROM order_items WHERE order_id=?", order.id);
  const ins = (account: string, entry: string, amount: number) =>
    run(
      `INSERT INTO ledger_entries (id, order_id, payment_id, event_key, account, entry_type, amount_minor, currency, created_at)
       VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(event_key, account, entry_type) DO NOTHING`,
      uuid(), order.id, paymentId, `pay:${paymentId}`, account, entry, amount, order.currency, now(),
    );
  let sellerAccount: string;
  let commissionBps = BEAT_COMMISSION_BPS;
  if (order.kind === "beat") sellerAccount = `seller:${items[0].seller_user_id}`;
  else {
    const studioId = order.kind === "booking"
      ? one("SELECT studio_id, source FROM bookings WHERE id=?", order.booking_id)!.studio_id
      : one("SELECT studio_id FROM projects WHERE id=?", order.project_id)!.studio_id;
    sellerAccount = `studio:${studioId}`;
    // Only platform-originated bookings carry commission; project balances for studio-owned clients don't (no double charging).
    commissionBps = order.kind === "booking" ? BOOKING_COMMISSION_BPS : 0;
  }
  const gross = order.total_minor;
  const commission = bps(gross, commissionBps);
  ins(sellerAccount, "collected", gross);
  ins("platform", "platform_fee", commission);
  ins("provider", "provider_fee", providerFee);
  ins(sellerAccount, "seller_payable", gross - commission - providerFee);
}

function fulfil(order: any) {
  if (order.kind === "beat") {
    grantEntitlements(order.id);
  } else if (order.kind === "booking") {
    const b = one("SELECT * FROM bookings WHERE id=?", order.booking_id)!;
    run("UPDATE bookings SET status='confirmed', hold_expires_at=NULL, paid_minor=paid_minor+? WHERE id=?", order.total_minor, b.id);
    const studio = one("SELECT name, owner_user_id FROM studios WHERE id=?", b.studio_id)!;
    notify(order.buyer_id, "booking", "Session confirmed", `Your deposit for ${studio.name} is received.`, "/library");
    notify(studio.owner_user_id, "booking", "New booking confirmed", `Deposit ${formatMoney(order.total_minor)} received`, "/studio");
    if (b.engineer_user_id) notify(b.engineer_user_id, "booking", "You've been assigned a session", new Date(b.starts_at).toUTCString(), "/studio");
  } else if (order.kind === "project") {
    run("UPDATE projects SET paid_minor = paid_minor + ? WHERE id=?", order.total_minor, order.project_id);
    const p = one("SELECT * FROM projects WHERE id=?", order.project_id)!;
    notify(order.buyer_id, "project", "Payment received", `${p.title} balance settled`, `/projects/${p.id}`);
    for (const m of all("SELECT user_id FROM memberships WHERE studio_id=? AND role IN ('owner','manager') AND revoked_at IS NULL", p.studio_id))
      notify(m.user_id, "payment", "Project balance paid", p.title, `/projects/${p.id}`);
  }
}

function grantEntitlements(orderId: string) {
  const order = one("SELECT * FROM orders WHERE id=?", orderId)!;
  for (const item of all("SELECT * FROM order_items WHERE order_id=? AND beat_id IS NOT NULL", orderId)) {
    const snap = JSON.parse(item.license_snapshot_json) as { tier: string; terms: LicenseTerms };
    const beat = one("SELECT * FROM beats WHERE id=?", item.beat_id)!;
    const assets: string[] = [];
    const files = snap.terms.includedFiles;
    if (files.includes("wav") || files.includes("mp3")) {
      // Basic (mp3) tiers receive the untagged master too; production transcodes a dedicated MP3 rendition.
      if (beat.master_asset_id) assets.push(beat.master_asset_id);
    }
    if (files.includes("stems") && beat.stems_asset_id) assets.push(beat.stems_asset_id);
    run(
      "INSERT INTO entitlements (id, user_id, order_item_id, beat_id, asset_ids_json, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(order_item_id) DO NOTHING",
      uuid(), order.buyer_id, item.id, item.beat_id, JSON.stringify(assets), now(),
    );
    run("UPDATE beats SET sales_count = sales_count + 1 WHERE id=?", item.beat_id);
    if (snap.tier === "exclusive") {
      // BM-05: unpublish after confirmed exclusive sale; existing non-exclusive licenses remain valid.
      run("UPDATE beats SET status='exclusive_sold', exclusive_hold_order_id=NULL, exclusive_hold_until=NULL WHERE id=?", item.beat_id);
      audit(null, "beat.exclusive_sold", "beat", item.beat_id, { orderId });
    }
    notify(item.seller_user_id, "sale", "You made a sale 🎉", item.description, "/producer");
  }
  notify(order.buyer_id, "order", "Your license is ready", `Order ${order.reference} — downloads unlocked`, `/orders/${orderId}`);
}

// ---------------- Expiry sweeps
registerSweep(() => {
  const t = now();
  tx(() => {
    for (const o of all("SELECT id, kind, booking_id FROM orders WHERE status IN ('pending','processing') AND expires_at IS NOT NULL AND expires_at < ?", t)) {
      run("UPDATE orders SET status='expired' WHERE id=?", o.id);
      run("UPDATE payments SET status='expired', updated_at=? WHERE order_id=? AND status='pending'", t, o.id);
      if (o.kind === "beat") run("UPDATE beats SET exclusive_hold_order_id=NULL, exclusive_hold_until=NULL WHERE exclusive_hold_order_id=?", o.id);
    }
  });
});

// ---------------- Downloads (time-limited signed URLs after entitlement checks)
export function downloadBeatAsset(actorIn: Actor | null, assetId: string) {
  const actor = requireActor(actorIn);
  const ent = all("SELECT e.* FROM entitlements e JOIN order_items oi ON oi.id=e.order_item_id JOIN orders o ON o.id=oi.order_id WHERE e.user_id=? AND e.revoked_at IS NULL AND o.status IN ('paid','partially_refunded')", actor.id)
    .find((e) => (JSON.parse(e.asset_ids_json) as string[]).includes(assetId));
  if (!ent) throw forbidden("You don't have a license that includes this file");
  const a = one("SELECT scan_status FROM assets WHERE id=?", assetId);
  if (!a || a.scan_status !== "clean") throw forbidden("File unavailable");
  audit(actor.id, "asset.download", "asset", assetId, { entitlementId: ent.id });
  return { url: signUrl(assetId, 120, "attachment"), expiresIn: 120 };
}

// ---------------- Disputes & refunds
export function openDispute(actorIn: Actor | null, orderId: string, reason: string) {
  const actor = requireActor(actorIn);
  const o = one("SELECT * FROM orders WHERE id=? AND buyer_id=?", orderId, actor.id);
  if (!o) throw notFound();
  if (!["paid", "partially_refunded"].includes(o.status)) throw conflict("Only paid orders can be disputed");
  if (one("SELECT 1 FROM disputes WHERE order_id=?", orderId)) throw conflict("A dispute is already open for this order");
  insert("disputes", { id: uuid(), order_id: orderId, opened_by: actor.id, reason: z.string().min(10).max(1000).parse(reason), status: "open", created_at: now() });
  run("UPDATE orders SET status='disputed' WHERE id=?", orderId);
  audit(actor.id, "dispute.open", "order", orderId);
  for (const admin of all("SELECT user_id FROM user_roles WHERE role='admin'")) notify(admin.user_id, "dispute", "New dispute", o.reference, "/admin");
}

export function resolveDispute(actorIn: Actor | null, disputeId: string, outcome: "refund" | "no_action", note: string) {
  const actor = requireRole(actorIn, "admin");
  const d = one("SELECT * FROM disputes WHERE id=?", disputeId);
  if (!d || d.status !== "open") throw notFound("Open dispute not found");
  tx(() => {
    const o = one("SELECT * FROM orders WHERE id=?", d.order_id)!;
    if (outcome === "refund") {
      refundTx(o, o.total_minor - o.refunded_minor, `dispute:${disputeId}`);
      // Access policy: refunded licenses are revoked.
      run("UPDATE entitlements SET revoked_at=? WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?)", now(), o.id);
      run("UPDATE disputes SET status='resolved_refund', resolution=? WHERE id=?", note, disputeId);
    } else {
      run("UPDATE orders SET status='paid' WHERE id=?", o.id);
      run("UPDATE disputes SET status='resolved_no_action', resolution=? WHERE id=?", note, disputeId);
    }
    notify(o.buyer_id, "dispute", "Dispute resolved", note || outcome, `/orders/${o.id}`);
  });
  audit(actor.id, `dispute.${outcome}`, "dispute", disputeId, { note });
}

export function refundOrder(actorIn: Actor | null, orderId: string, amountMajor?: number) {
  const actor = requireRole(actorIn, "admin");
  tx(() => {
    const o = one("SELECT * FROM orders WHERE id=?", orderId);
    if (!o || !["paid", "partially_refunded", "disputed"].includes(o.status)) throw conflict("Order is not refundable");
    const amount = amountMajor ? Math.round(amountMajor * 100) : o.total_minor - o.refunded_minor;
    refundTx(o, amount, `refund:${uuid()}`);
  });
  audit(actor.id, "order.refund", "order", orderId, { amountMajor });
}

function refundTx(o: any, amount: number, eventKey: string) {
  if (amount <= 0 || amount > o.total_minor - o.refunded_minor) throw badRequest("Invalid refund amount");
  const item = one("SELECT * FROM order_items WHERE order_id=? LIMIT 1", o.id)!;
  const account = o.kind === "beat" ? `seller:${item.seller_user_id}` : `studio:${o.kind === "booking" ? one("SELECT studio_id FROM bookings WHERE id=?", o.booking_id)!.studio_id : one("SELECT studio_id FROM projects WHERE id=?", o.project_id)!.studio_id}`;
  // Platform returns its proportional commission; seller bears the remainder of the refund.
  const ratio = amount / o.total_minor;
  const commissionBack = Math.round((one<{ v: number }>("SELECT COALESCE(SUM(amount_minor),0) v FROM ledger_entries WHERE order_id=? AND entry_type='platform_fee'", o.id)!.v) * ratio);
  const ins = (acct: string, type: string, amt: number) => insert("ledger_entries", { id: uuid(), order_id: o.id, payment_id: null, event_key: eventKey, account: acct, entry_type: type, amount_minor: amt, currency: o.currency, created_at: now() });
  ins(account, "refund", -(amount - commissionBack));
  ins("platform", "refund", -commissionBack);
  ins(account, "collected_refund", -amount);
  const refunded = o.refunded_minor + amount;
  run("UPDATE orders SET refunded_minor=?, status=? WHERE id=?", refunded, refunded >= o.total_minor ? "refunded" : "partially_refunded", o.id);
  run("UPDATE payments SET status=?, updated_at=? WHERE order_id=? AND status='paid'", refunded >= o.total_minor ? "refunded" : "partially_refunded", now(), o.id);
}

// ---------------- Producer sales & payouts
export function producerSales(actorIn: Actor | null) {
  const actor = requireRole(actorIn, "beatmaker");
  const rows = all(
    `SELECT o.reference, o.status, o.paid_at, oi.description, oi.price_minor,
       COALESCE((SELECT SUM(amount_minor) FROM ledger_entries l WHERE l.order_id=o.id AND l.entry_type='platform_fee'),0) platform_fee,
       COALESCE((SELECT SUM(amount_minor) FROM ledger_entries l WHERE l.order_id=o.id AND l.entry_type='provider_fee'),0) provider_fee,
       COALESCE((SELECT SUM(amount_minor) FROM ledger_entries l WHERE l.order_id=o.id AND l.account=? AND l.entry_type IN ('seller_payable','refund')),0) net
     FROM order_items oi JOIN orders o ON o.id=oi.order_id
     WHERE oi.seller_user_id=? AND o.kind='beat' AND o.status NOT IN ('pending','processing','expired','failed')
     ORDER BY o.paid_at DESC LIMIT 200`,
    `seller:${actor.id}`, actor.id,
  );
  const payouts = all("SELECT id, amount_minor, status, created_at FROM payouts WHERE user_id=? ORDER BY created_at DESC", actor.id);
  return { rows, payouts };
}

export function verifyPayoutIdentity(actorIn: Actor | null) {
  const actor = requireRole(actorIn, "beatmaker");
  // Production: redirect to the provider's KYC/seller onboarding; here the sandbox approves instantly.
  run("UPDATE producer_profiles SET payout_verified=1 WHERE user_id=?", actor.id);
  audit(actor.id, "payout.kyc_verified", "user", actor.id);
}

export function requestPayout(actorIn: Actor | null) {
  const actor = requireRole(actorIn, "beatmaker");
  return tx(() => {
    const p = one("SELECT payout_verified FROM producer_profiles WHERE user_id=?", actor.id);
    if (!p?.payout_verified) throw forbidden("Verify your identity with the payment provider before requesting payouts");
    const net = one<{ v: number }>("SELECT COALESCE(SUM(amount_minor),0) v FROM ledger_entries WHERE account=? AND entry_type IN ('seller_payable','refund')", `seller:${actor.id}`)!.v;
    const out = one<{ v: number }>("SELECT COALESCE(SUM(amount_minor),0) v FROM payouts WHERE user_id=? AND status!='failed'", actor.id)!.v;
    const available = net - out;
    if (available < 1000) throw badRequest("Minimum payout is GHS 10");
    const id = uuid();
    insert("payouts", { id, user_id: actor.id, amount_minor: available, currency: "GHS", status: "paid", created_at: now() });
    insert("ledger_entries", { id: uuid(), order_id: one("SELECT order_id FROM ledger_entries WHERE account=? LIMIT 1", `seller:${actor.id}`)!.order_id, payment_id: null, event_key: `payout:${id}`, account: `seller:${actor.id}`, entry_type: "payout", amount_minor: -available, currency: "GHS", created_at: now() });
    audit(actor.id, "payout.request", "payout", id, { amount: available });
    notify(actor.id, "payout", "Payout sent", `${formatMoney(available)} to your mobile money wallet`, "/producer");
    return { id, amountMinor: available };
  });
}

// ---------------- License document (PDF)
export function licenseDocument(actorIn: Actor | null, orderId: string) {
  const actor = requireActor(actorIn);
  const o = one("SELECT * FROM orders WHERE id=?", orderId);
  if (!o || (o.buyer_id !== actor.id && !hasRole(actor, "admin"))) throw notFound();
  if (!["paid", "partially_refunded", "disputed"].includes(o.status)) throw forbidden("License issues after payment is verified");
  const item = one("SELECT * FROM order_items WHERE order_id=? AND license_snapshot_json IS NOT NULL", orderId);
  if (!item) throw notFound();
  const s = JSON.parse(item.license_snapshot_json);
  const buyer = one("SELECT name, email FROM users WHERE id=?", o.buyer_id)!;
  const t: LicenseTerms = s.terms;
  const lim = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString());
  const lines = [
    ["h1", "SoundRoot License Agreement"],
    ["p", `Order ${o.reference}  ·  Issued ${new Date(o.paid_at ?? o.created_at).toUTCString()}`],
    ["h2", `${s.beat.title} — ${s.name} (license version ${s.version})`],
    ["p", `Licensor (producer): ${s.beat.producer}`],
    ["p", `Licensee: ${buyer.name} <${buyer.email}>`],
    ["p", `Fee paid: ${formatMoney(o.total_minor, o.currency)}   Terms accepted: ${item.terms_accepted_at}`],
    ["h2", "Grant"],
    ["p", t.summary + (t.exclusive ? " The licensor will not issue further licenses for this beat." : " This license is non-exclusive.")],
    ["p", `Permitted uses: ${t.permittedUses.join(", ")}`],
    ["p", `Distribution limit: ${lim(t.distributionLimit)}   Streams: ${lim(t.streamLimit)}   Music videos: ${lim(t.musicVideos)}`],
    ["p", `Term: ${t.term}   Territory: ${t.territory}   Commercial use: ${t.commercial ? "Yes" : "No"}`],
    ["p", `Included files: ${t.includedFiles.join(", ").toUpperCase()}`],
    ["p", `Credit: ${t.creditRequired}`],
    ["h2", "Ownership"],
    ["p", s.copyrightNotice],
    ["p", `License ID ${s.licenseVersionId} · Snapshot is immutable and stored with the order.`],
  ] as const;
  return { filename: `SoundRoot-License-${o.reference}.pdf`, pdf: simplePdf(lines as unknown as [string, string][]) };
}

/** Tiny dependency-free PDF writer (Helvetica, word-wrapped). */
function simplePdf(blocks: [string, string][]): Uint8Array {
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, "-").replace(/([\\()])/g, "\\$1");
  const ops: string[] = ["0.07 0.12 0.14 rg 0 792 612 -70 re f", "0.91 0.69 0.29 rg 50 760 60 4 re f"];
  let y = 740;
  ops.push(`BT /F2 11 Tf 1 1 1 rg 50 ${y + 4} Td (SOUNDROOT) Tj ET`);
  y = 690;
  for (const [kind, text] of blocks) {
    const size = kind === "h1" ? 20 : kind === "h2" ? 13 : 10;
    const font = kind === "p" ? "F1" : "F2";
    const maxChars = Math.floor(510 / (size * 0.5));
    const words = text.split(" ");
    const wrapped: string[] = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > maxChars) { wrapped.push(line); line = w; } else line = (line + " " + w).trim();
    }
    if (line) wrapped.push(line);
    if (kind !== "p") y -= 8;
    for (const l of wrapped) {
      ops.push(`BT /${font} ${size} Tf 0.1 0.12 0.14 rg 50 ${y} Td (${esc(l)}) Tj ET`);
      y -= size + 5;
    }
    y -= 4;
  }
  const stream = ops.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}
