"use client";
import { useRouter } from "next/navigation";
import { api, useAsync } from "@/components/ui";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const { busy, run } = useAsync();
  return (
    <button className="btn btn-teal btn-lg" disabled={busy} onClick={() => run(async () => { await api(`/api/v1/invites/${token}`, { method: "POST" }); router.push("/studio"); router.refresh(); }, "Welcome to the team")}>
      Accept invite
    </button>
  );
}
