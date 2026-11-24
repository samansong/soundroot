"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, money, StatusBadge, Tabs, useAsync } from "@/components/ui";

export function AdminConsole() {
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<"moderation" | "disputes" | "transactions" | "producers" | "audit">("moderation");
  const { busy, run } = useAsync();
  const load = useCallback(() => api("/api/v1/admin").then(setD), []);
  useEffect(() => { void load(); }, [load]);
  const act = (json: any, ok: string) => run(async () => { await api("/api/v1/admin", { method: "POST", json }); await load(); }, ok);
  if (!d) return <div className="muted">Loading…</div>;
  const m = d.metrics;
  return (
    <div className="stack lg">
      <header><div className="eyebrow">Platform admin · every action is audited</div><h1 style={{ marginTop: 10 }}>Trust & operations</h1></header>
      <div className="grid cols-4">
        <div className="card stat"><div className="label-sm">GMV (verified)</div><div className="value gold">{money(m.gmvMinor)}</div></div>
        <div className="card stat"><div className="label-sm">Platform revenue</div><div className="value teal">{money(m.platformRevenueMinor)}</div></div>
        <div className="card stat"><div className="label-sm">Paid beat orders · bookings</div><div className="value">{m.paidBeatOrders} · {m.completedBookings}</div></div>
        <div className="card stat"><div className="label-sm">Dispute rate · failed jobs</div><div className="value">{(m.disputeRate * 100).toFixed(1)}% · {m.failedJobs}</div></div>
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: "moderation", label: `Reports (${d.reports.filter((r: any) => r.status === "open").length})` },
        { value: "disputes", label: `Disputes (${d.disputes.filter((r: any) => r.status === "open").length})` },
        { value: "transactions", label: "Transactions" }, { value: "producers", label: "Seller verification" }, { value: "audit", label: "Audit log" },
      ]} />
      {tab === "moderation" && (
        <div className="stack">
          {d.reports.length === 0 && <div className="empty">No reports.</div>}
          {d.reports.map((r: any) => (
            <div key={r.id} className="card flat row top wrap">
              <div className="grow stack" style={{ gap: 4 }}>
                <div className="row wrap"><Link href={`/beats/${r.beat_id}`} style={{ fontWeight: 800 }}>{r.beat_title}</Link><StatusBadge status={r.beat_status} /><StatusBadge status={r.status} /></div>
                <div className="text-2 small">“{r.reason}”</div>
                <div className="xs muted">Reported by {r.reporter ?? "anonymous"} · {new Date(r.created_at).toLocaleString()}{r.resolution ? ` · ${r.resolution}` : ""}</div>
              </div>
              {r.status === "open" && (
                <div className="row">
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act({ action: "report", id: r.id, decision: "dismiss", note: "No infringement found" }, "Report dismissed")}>Dismiss</button>
                  <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => { const note = prompt("Takedown note for the producer:", "Taken down pending sample clearance."); if (note !== null) act({ action: "report", id: r.id, decision: "takedown", note }, "Beat taken down"); }}>Take down</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {tab === "disputes" && (
        <div className="stack">
          {d.disputes.length === 0 && <div className="empty">No disputes.</div>}
          {d.disputes.map((x: any) => (
            <div key={x.id} className="card flat row wrap top">
              <div className="grow"><div className="row"><b className="mono">{x.reference}</b><StatusBadge status={x.status} /><span>{money(x.total_minor)}</span></div><div className="text-2 small">“{x.reason}” — {x.opened_by_name}</div>{x.resolution && <div className="xs muted">{x.resolution}</div>}</div>
              {x.status === "open" && <div className="row">
                <button className="btn btn-sm" disabled={busy} onClick={() => act({ action: "dispute", id: x.id, decision: "no_action", note: "Delivered as described" }, "Closed")}>Close, no refund</button>
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act({ action: "dispute", id: x.id, decision: "refund", note: "Refunded in full; license revoked" }, "Refunded")}>Refund & revoke</button>
              </div>}
            </div>
          ))}
        </div>
      )}
      {tab === "transactions" && (
        <div className="table-wrap"><table className="table"><thead><tr><th>Reference</th><th>Kind</th><th>Buyer</th><th>Total</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
          {d.transactions.map((o: any) => <tr key={o.id}><td className="mono">{o.reference}</td><td>{o.kind}</td><td>{o.buyer}</td><td>{money(o.total_minor)}</td><td><StatusBadge status={o.status} /></td><td className="small">{new Date(o.created_at).toLocaleString()}</td>
            <td>{["paid", "partially_refunded"].includes(o.status) && o.total_minor > 0 && !o.reference.startsWith("CASH") && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => confirm(`Refund ${o.reference} in full?`) && act({ action: "refund", id: o.id }, "Refund recorded")}>Refund</button>}</td></tr>)}
        </tbody></table></div>
      )}
      {tab === "producers" && (
        <div className="table-wrap"><table className="table"><thead><tr><th>Producer</th><th>Email</th><th>Beats</th><th>Payout KYC</th><th></th></tr></thead><tbody>
          {d.producers.map((p: any) => <tr key={p.id}><td><Link href={`/producers/${p.slug}`}><b>{p.display_name}</b></Link></td><td className="small">{p.email}</td><td>{p.beats}</td><td>{p.payout_verified ? <span className="badge ok">Verified</span> : <span className="badge warn">Unverified</span>}</td>
            <td><button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act({ action: "verify_producer", id: p.id, verified: !p.payout_verified }, "Updated")}>{p.payout_verified ? "Revoke" : "Verify"}</button></td></tr>)}
        </tbody></table></div>
      )}
      {tab === "audit" && (
        <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead><tbody>
          {d.audit.map((a: any) => <tr key={a.id}><td className="small">{new Date(a.created_at).toLocaleString()}</td><td>{a.actor ?? <span className="muted">system</span>}</td><td className="mono">{a.action}</td><td className="small muted">{a.resource_type} {a.resource_id?.slice(0, 8)}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}
