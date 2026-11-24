import { notFound, redirect } from "next/navigation";
import { getOrder } from "@/server/modules/billing";
import { getActor } from "@/server/session";
import { OrderView } from "./OrderView";

export const metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=/orders/${id}`);
  let order;
  try { order = getOrder(actor, id); } catch { notFound(); }
  return <div className="page"><OrderView initial={order} /></div>;
}
