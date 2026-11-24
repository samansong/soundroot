import Link from "next/link";
import { redirect } from "next/navigation";
import { myOrders } from "@/server/modules/billing";
import { myBookings } from "@/server/modules/studio";
import { getActor } from "@/server/session";
import { Artwork } from "@/components/Artwork";
import { StatusBadge } from "@/components/ui";
import { money } from "@/lib/format";
import { CancelBooking } from "./CancelBooking";

export const metadata = { title: "Library" };

export default async function LibraryPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/library");
  const orders = myOrders(actor).filter((o) => !o.reference.startsWith("CASH"));
  const bookings = myBookings(actor);
  const beatOrders = orders.filter((o) => o.kind === "beat");
  const fmt = (iso: string, tz: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="page stack xl">
      <header><div className="eyebrow">Library</div><h1 style={{ marginTop: 10 }}>Your licenses & sessions</h1></header>

      <section className="stack">
        <h2>Licensed beats</h2>
        {beatOrders.length === 0 ? <div className="empty">No licenses yet. <Link href="/beats" className="gold">Explore beats</Link></div> : (
          <div className="grid cols-2">
            {beatOrders.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="card tight row" style={{ gap: 14 }}>
                <Artwork seed={o.art_seed ?? 1} hue={o.hue ?? 168} size={64} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontWeight: 750 }}>{o.description}</div>
                  <div className="muted xs">{o.reference} · {new Date(o.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800 }}>{money(o.total_minor)}</div><StatusBadge status={o.status} /></div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <h2>Studio bookings</h2>
        {bookings.length === 0 ? <div className="empty">No bookings yet. <Link href="/studios" className="gold">Find a studio</Link></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Studio</th><th>Session</th><th>Deposit</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td><b>{fmt(b.starts_at, b.timezone)}</b></td>
                    <td><Link href={`/studios/${b.studio_slug}`}>{b.studio_name}</Link></td>
                    <td className="text-2">{b.service_name} · {b.room_name}{b.engineer_name ? ` · ${b.engineer_name}` : ""}</td>
                    <td>{money(b.paid_minor)} / {money(b.deposit_minor)}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td style={{ textAlign: "right" }}>
                      {b.pending_order_id && b.status === "held" && <Link className="btn btn-sm btn-primary" href={`/orders/${b.pending_order_id}`}>Pay deposit</Link>}
                      {["held", "confirmed"].includes(b.status) && new Date(b.starts_at) > new Date() && <CancelBooking id={b.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack">
        <h2>All orders</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Reference</th><th>Item</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}><td><Link href={`/orders/${o.id}`} className="mono">{o.reference}</Link></td><td className="text-2">{o.description}</td><td>{money(o.total_minor)}</td><td><StatusBadge status={o.status} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
