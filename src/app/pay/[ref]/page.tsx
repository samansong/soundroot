import { notFound } from "next/navigation";
import { providerSession } from "@/server/modules/billing";
import { SandboxPay } from "./SandboxPay";

export const metadata = { title: "SandboxPay checkout (test mode)" };

// Simulates the payment provider's hosted checkout (a different "website").
export default async function PayPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  let s;
  try { s = providerSession(ref); } catch { notFound(); }
  return <SandboxPay session={s} />;
}
