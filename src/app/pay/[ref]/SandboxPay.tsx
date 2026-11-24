"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, money } from "@/components/ui";

interface Session { providerRef: string; orderId: string; reference: string; amountMinor: number; currency: string; method: string | null; status: string; description: string }

export function SandboxPay({ session }: { session: Session }) {
  const router = useRouter();
  const [method, setMethod] = useState<"momo" | "card">((session.method as "momo") ?? "momo");
  const [network, setNetwork] = useState("MTN MoMo");
  const [step, setStep] = useState<"form" | "approve" | "sending">("form");
  const [err, setErr] = useState<string | null>(null);

  const authorize = async (outcome: "succeed" | "fail") => {
    setStep("sending");
    setErr(null);
    try {
      await api("/api/sandbox/authorize", { method: "POST", json: { providerRef: session.providerRef, outcome } });
      // Return to the merchant. The merchant waits for the signed webhook — it never trusts this redirect.
      router.push(`/orders/${session.orderId}?from=checkout`);
    } catch (e: any) {
      setErr(e.message);
      setStep("form");
    }
  };

  return (
    <div className="pay-shell">
      <div className="pay-card stack" style={{ gap: 18 }}>
        <div className="row between">
          <b style={{ fontSize: "1.2rem", letterSpacing: "-.02em" }}>Sandbox<span style={{ color: "#4a5cff" }}>Pay</span></b>
          <span style={{ background: "#fff3cd", color: "#7a5a00", fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6 }}>TEST MODE</span>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "#5b6478" }}>Pay SoundRoot</div>
          <div style={{ fontSize: "2.2rem", fontWeight: 800, letterSpacing: "-.03em" }}>{money(session.amountMinor, session.currency)}</div>
          <div style={{ fontSize: 13, color: "#5b6478" }}>{session.description}</div>
          <div style={{ fontSize: 12, color: "#8a93a6", marginTop: 4 }}>Ref {session.reference} · {session.providerRef}</div>
        </div>
        {session.status !== "pending" ? (
          <div style={{ padding: 14, borderRadius: 12, background: "#eef0ff", fontSize: 14 }}>This payment is already {session.status}. <a style={{ color: "#4a5cff", fontWeight: 700 }} href={`/orders/${session.orderId}`}>Return to merchant</a></div>
        ) : step === "approve" ? (
          <div className="stack" style={{ gap: 12 }}>
            <div style={{ padding: 16, borderRadius: 14, background: "#f0f2f8", fontSize: 14, lineHeight: 1.5 }}>
              <b>{network === "Card" ? "3-D Secure check" : `Approve on your phone`}</b>
              <div style={{ color: "#5b6478" }}>{network === "Card" ? "Your bank is verifying this payment." : `A prompt was sent to 024 ••• 0000. Enter your MoMo PIN on the handset to approve ${money(session.amountMinor)}.`}</div>
            </div>
            <button className="btn btn-lg" style={{ background: "#16a34a", color: "white", border: "none" }} onClick={() => authorize("succeed")}>Simulate approval</button>
            <button className="btn" style={{ background: "white", color: "#b91c1c", borderColor: "#f3c2c2" }} onClick={() => authorize("fail")}>Simulate decline</button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row">
              <button className={`pay-method ${method === "momo" ? "on" : ""}`} onClick={() => { setMethod("momo"); setNetwork("MTN MoMo"); }}>📱 Mobile Money</button>
              <button className={`pay-method ${method === "card" ? "on" : ""}`} onClick={() => { setMethod("card"); setNetwork("Card"); }}>💳 Card</button>
            </div>
            {method === "momo" ? (
              <>
                <select className="input select" value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Network">
                  <option>MTN MoMo</option><option>Telecel Cash</option><option>AirtelTigo Money</option>
                </select>
                <input className="input" defaultValue="024 000 0000" aria-label="Test wallet number" readOnly />
              </>
            ) : (
              <input className="input" defaultValue="4084 0840 8408 4081 (test card)" aria-label="Test card" readOnly />
            )}
            <div style={{ fontSize: 12, color: "#8a93a6" }}>Sandbox values only — no real money moves. The merchant is notified by a signed webhook.</div>
            {err && <div style={{ color: "#b91c1c", fontSize: 13 }}>{err}</div>}
            <button className="btn btn-lg" disabled={step === "sending"} style={{ background: "#4a5cff", color: "white", border: "none" }} onClick={() => setStep("approve")}>
              {step === "sending" ? "Processing…" : `Pay ${money(session.amountMinor, session.currency)}`}
            </button>
            <a href={`/orders/${session.orderId}`} style={{ textAlign: "center", fontSize: 13, color: "#5b6478" }}>Cancel and return</a>
          </div>
        )}
      </div>
    </div>
  );
}
