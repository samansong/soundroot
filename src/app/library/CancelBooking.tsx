"use client";
import { useRouter } from "next/navigation";
import { api, useAsync } from "@/components/ui";

export function CancelBooking({ id }: { id: string }) {
  const router = useRouter();
  const { busy, run } = useAsync();
  return (
    <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => confirm("Cancel this booking?") && run(async () => { await api(`/api/v1/bookings/${id}`, { method: "PATCH", json: { action: "cancel" } }); router.refresh(); }, "Booking cancelled")}>
      Cancel
    </button>
  );
}
