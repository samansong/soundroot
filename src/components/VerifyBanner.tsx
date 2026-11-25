"use client";
import { useState } from "react";
import { api, useToast } from "./ui";

export function ResendButton({ className = "btn btn-primary" }: { className?: string }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  return (
    <button
      className={className}
      disabled={state !== "idle"}
      onClick={async () => {
        setState("busy");
        try {
          const r = await api<{ sent?: boolean; email?: string; alreadyVerified?: boolean }>("/api/v1/auth/verify-email", { method: "POST" });
          if (r.alreadyVerified) { location.reload(); return; }
          setState("sent");
          toast(`Sent a new link to ${r.email}`, "ok");
        } catch (e: any) {
          setState("idle");
          toast(e.message, "bad");
        }
      }}
    >
      {state === "sent" ? "Link sent ✓" : state === "busy" ? "Sending…" : "Resend link"}
    </button>
  );
}

/** Shown on every page until the signed-in user confirms their email address. */
export function VerifyBanner({ email }: { email: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="verify-banner glass-pane" role="status">
      <span className="vb-icon" aria-hidden>✉️</span>
      <div className="grow">
        <b>Confirm your email to start buying and booking.</b>
        <div className="small" style={{ color: "rgba(255,255,255,.7)" }}>We sent a link to {email}. Check your inbox (and spam).</div>
      </div>
      <ResendButton className="btn btn-sm btn-glass" />
      <button className="btn btn-sm btn-ghost" aria-label="Hide for now" onClick={() => setHidden(true)}>✕</button>
    </div>
  );
}
