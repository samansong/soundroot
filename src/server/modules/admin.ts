// Admin module: moderation, verification, disputes, transactions and audit (least privilege, every action audited).
import { all, one, run } from "../db.ts";
import { type Actor, requireRole } from "../auth.ts";
import { notFound } from "../errors.ts";
import { audit, notify } from "../audit.ts";

export function adminOverview(actorIn: Actor | null) {
  requireRole(actorIn, "admin");
  const n = (sql: string) => one<{ n: number }>(sql)!.n;
  return {
    metrics: {
      users: n("SELECT COUNT(*) n FROM users"),
      activeStudios: n("SELECT COUNT(DISTINCT studio_id) n FROM bookings WHERE created_at > datetime('now','-30 days')"),
      publishedBeats: n("SELECT COUNT(*) n FROM beats WHERE status='published'"),
      paidBeatOrders: n("SELECT COUNT(*) n FROM orders WHERE kind='beat' AND status='paid' AND total_minor>0"),
      completedBookings: n("SELECT COUNT(*) n FROM bookings WHERE status IN ('confirmed','completed')"),
      gmvMinor: n("SELECT COALESCE(SUM(amount_minor),0) n FROM ledger_entries WHERE entry_type='collected' AND event_key LIKE 'pay:%'"),
      platformRevenueMinor: n("SELECT COALESCE(SUM(amount_minor),0) n FROM ledger_entries WHERE account='platform'"),
      disputeRate: (() => { const p = n("SELECT COUNT(*) n FROM orders WHERE status NOT IN ('pending','processing','expired','failed')"); return p ? n("SELECT COUNT(*) n FROM disputes") / p : 0; })(),
      failedJobs: n("SELECT COUNT(*) n FROM jobs WHERE status='failed'"),
    },
    reports: all("SELECT r.*, b.title beat_title, b.status beat_status, u.name reporter FROM reports r JOIN beats b ON b.id=r.beat_id LEFT JOIN users u ON u.id=r.reporter_id ORDER BY r.status='open' DESC, r.created_at DESC LIMIT 50"),
    disputes: all("SELECT d.*, o.reference, o.total_minor, u.name opened_by_name FROM disputes d JOIN orders o ON o.id=d.order_id JOIN users u ON u.id=d.opened_by ORDER BY d.status='open' DESC, d.created_at DESC LIMIT 50"),
    transactions: all("SELECT o.id, o.reference, o.kind, o.status, o.total_minor, o.created_at, u.name buyer FROM orders o JOIN users u ON u.id=o.buyer_id ORDER BY o.created_at DESC LIMIT 40"),
    producers: all("SELECT p.id, p.display_name, p.slug, p.payout_verified, u.email, (SELECT COUNT(*) FROM beats WHERE producer_id=p.id) beats FROM producer_profiles p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 50"),
    audit: all("SELECT a.*, u.name actor FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 60"),
  };
}

export function moderateReport(actorIn: Actor | null, reportId: string, action: "takedown" | "dismiss", note: string) {
  const actor = requireRole(actorIn, "admin");
  const r = one("SELECT * FROM reports WHERE id=?", reportId);
  if (!r) throw notFound();
  if (action === "takedown") {
    run("UPDATE beats SET status='taken_down' WHERE id=?", r.beat_id);
    const owner = one("SELECT p.user_id, b.title FROM beats b JOIN producer_profiles p ON p.id=b.producer_id WHERE b.id=?", r.beat_id)!;
    notify(owner.user_id, "moderation", `"${owner.title}" was taken down`, note || "Following an infringement report. Existing licenses remain on record.", "/producer");
  }
  run("UPDATE reports SET status=?, resolution=? WHERE id=?", action === "takedown" ? "actioned" : "dismissed", note, reportId);
  audit(actor.id, `moderation.${action}`, "beat", r.beat_id, { reportId, note });
}

export function setProducerVerified(actorIn: Actor | null, producerId: string, verified: boolean) {
  const actor = requireRole(actorIn, "admin");
  run("UPDATE producer_profiles SET payout_verified=? WHERE id=?", verified ? 1 : 0, producerId);
  audit(actor.id, verified ? "producer.verify" : "producer.unverify", "producer", producerId);
}
