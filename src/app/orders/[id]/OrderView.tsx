"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconCheck, IconDoc, IconDownload } from "@/components/icons";
import { api, Modal, money, StatusBadge, useAsync } from "@/components/ui";
import { Orb } from "@/components/visuals";

export function OrderView({ initial }: { initial: any }) {
  const router = useRouter();
  const [o, setO] = useState(initial);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { busy, run } = useAsync();
  const waiting = ["pending", "processing"].includes(o.status) && o.payments.some((p: any) => p.status === "pending" || p.status === "paid");

  // Poll until the webhook has been verified server-side.
  useEffect(() => {
    if (!["pending", "processing"].includes(o.status)) return;
    const t = setInterval(async () => {
      const n = await api(`/api/v1/orders/${o.id}`).catch(() => null);
      if (n) setO(n);
    }, 1200);
    return () => clearInterval(t);
  }, [o.id, o.status]);

  const download = (assetId: string) => run(async () => {
    const { url } = await api<{ url: string }>(`/api/v1/assets/${assetId}/download`);
    window.location.href = url;
  });
  const lastFailed = o.payments.length && o.payments[o.payments.length - 1].status === "failed";
  const paid = ["paid", "partially_refunded", "disputed"].includes(o.status);
  const item = o.items[0];

  return (
    <div className="stack lg" style={{ maxWidth: 860 }}>
      <div className="card fade-up" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ padding: 28, gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 120, height: 120, position: "relative", flex: "none" }}>
            {paid ? (
              <div style={{ width: 120, height: 120, borderRadius: "50%", display: "grid", placeItems: "center", background: "radial-gradient(circle, rgba(79,211,154,.35), transparent 70%)" }}>
                <div style={{ width: 70, height: 70, borderRadius: "50%", background: "var(--ok)", display: "grid", placeItems: "center", color: "#04211b", boxShadow: "0 0 50px var(--ok)" }}><IconCheck width={34} height={34} strokeWidth={3} /></div>
              </div>
            ) : <Orb hue={o.status === "expired" ? 0 : 40} />}
          </div>
          <div className="grow stack" style={{ gap: 6 }}>
            <div className="row wrap" style={{ gap: 8 }}><span className="eyebrow">Order {o.reference}</span><StatusBadge status={o.status} /></div>
            <h2>{paid ? (o.kind === "beat" ? "Your license is ready" : "Payment received") : o.status === "expired" ? "This checkout expired" : lastFailed ? "Payment didn't go through" : "Waiting for payment confirmation…"}</h2>
            <p className="text-2">{item?.description}</p>
            {!paid && waiting && !lastFailed && <p className="muted small">We confirm payments only from the provider's signed webhook — never from the browser redirect. This usually takes a second.</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="muted xs">Total</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 700 }}>{money(o.totalMinor, o.currency)}</div>
          </div>
        </div>
        {lastFailed && o.status === "pending" && (
          <div style={{ padding: "0 28px 24px" }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { const c = await api<{ checkoutUrl: string }>("/api/v1/payments/checkout", { method: "POST", json: { orderId: o.id, idempotencyKey: crypto.randomUUID() } }); router.push(c.checkoutUrl); })}>Try payment again</button>
          </div>
        )}
      </div>

      {paid && o.kind === "beat" && item && (
        <div className="grid cols-2">
          <div className="card stack">
            <h3>Downloads</h3>
            {item.entitlement ? item.entitlement.assets.map((a: any) => (
              <button key={a.id} className="btn" style={{ justifyContent: "space-between" }} disabled={busy} onClick={() => download(a.id)}>
                <span className="row truncate"><IconDownload />{a.filename}</span><span className="xs muted">{(a.size / 1048576).toFixed(1)} MB</span>
              </button>
            )) : <div className="notice warn">Access to these files has been revoked (refund or dispute policy).</div>}
            <span className="xs muted">Links are signed and expire after 2 minutes. Re-download anytime from your Library.</span>
          </div>
          <div className="card stack">
            <h3>License</h3>
            <div className="text-2 small">{item.license?.name} · version {item.license?.version}</div>
            <div className="small">{item.license?.terms.summary}</div>
            <a className="btn btn-teal" href={`/api/v1/orders/${o.id}/license`} target="_blank" rel="noreferrer"><IconDoc />Open license PDF</a>
            <div className="xs muted">{item.license?.copyrightNotice}</div>
          </div>
        </div>
      )}
      {paid && o.kind === "booking" && <div className="notice ok">Your session is confirmed. See it under <Link href="/library" style={{ textDecoration: "underline" }}>Library → Bookings</Link>.</div>}
      {paid && o.kind === "project" && <div className="notice ok">Balance settled. <Link href={`/projects/${o.projectId}`} style={{ textDecoration: "underline" }}>Return to the project</Link> to download your final files.</div>}

      <div className="row wrap">
        <Link href="/library" className="btn">Go to Library</Link>
        <Link href="/beats" className="btn btn-ghost">Keep exploring</Link>
        <div className="grow" />
        {paid && !o.dispute && <button className="btn btn-ghost btn-sm" onClick={() => setDisputeOpen(true)}>Report a problem</button>}
        {o.dispute && <span className="small muted">Dispute: <StatusBadge status={o.dispute.status} /> {o.dispute.resolution}</span>}
      </div>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Open a dispute">
        <div className="stack">
          <p className="muted small">Tell us what went wrong. Our team reviews disputes and can issue refunds per our policy.</p>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || reason.length < 10} onClick={() => run(async () => { await api(`/api/v1/orders/${o.id}/dispute`, { method: "POST", json: { reason } }); setDisputeOpen(false); setO(await api(`/api/v1/orders/${o.id}`)); }, "Dispute opened")}>Submit</button>
        </div>
      </Modal>
    </div>
  );
}
