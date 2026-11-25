"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/icons";
import { api, useAsync } from "@/components/ui";

const ROLES = [
  { v: "artist", t: "Artist", d: "License beats, book sessions, review mixes" },
  { v: "beatmaker", t: "Beatmaker", d: "Sell beats with clear license tiers" },
  { v: "studio_owner", t: "Studio owner", d: "Run bookings, clients, projects and revenue" },
] as const;

const DEMO = [
  ["Artist", "ama@soundroot.test"], ["Producer", "kofi.sound@soundroot.test"], ["Studio owner", "efua@soundroot.test"],
  ["Engineer", "kofi.eng@soundroot.test"], ["Admin", "admin@soundroot.test"],
];

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", studioName: "", roles: ["artist"] as string[] });
  const { busy, run } = useAsync();
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  const submit = (e: React.FormEvent, override?: { email: string; password: string }) => {
    e.preventDefault();
    run(async () => {
      if (mode === "login" || override) await api("/api/v1/auth/login", { method: "POST", json: override ?? { email: f.email, password: f.password } });
      else await api("/api/v1/auth/signup", { method: "POST", json: f });
      const roles = f.roles;
      router.push(safeNext ?? (mode === "signup" ? (roles.includes("studio_owner") ? "/studio" : roles.includes("beatmaker") ? "/producer" : "/beats") : "/"));
      router.refresh();
    });
  };
  const toggle = (r: string) => setF((s) => ({ ...s, roles: s.roles.includes(r) ? s.roles.filter((x) => x !== r) : [...s.roles, r] }));

  return (
    <div className="auth-card stack lg fade-up">
      <div className="card stack lg" style={{ padding: 30 }}>
        <div className="stack" style={{ gap: 6 }}>
          <Logo size={40} />
          <h2 style={{ marginTop: 8 }}>{mode === "login" ? "Welcome back" : "Join SoundzRoot"}</h2>
          <p className="muted small">{mode === "login" ? "Sign in to your studio, catalog and projects." : "One account — add more roles any time."}</p>
        </div>
        <form className="stack" onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label className="label">Name<input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
              <div className="stack" style={{ gap: 8 }}>
                <span className="label">I am a…</span>
                {ROLES.map((r) => (
                  <label key={r.v} className={`role-opt ${f.roles.includes(r.v) ? "on" : ""}`}>
                    <input type="checkbox" checked={f.roles.includes(r.v)} onChange={() => toggle(r.v)} />
                    <span><b>{r.t}</b><div className="muted small">{r.d}</div></span>
                  </label>
                ))}
              </div>
              {f.roles.includes("studio_owner") && <label className="label">Studio name<input className="input" value={f.studioName} onChange={(e) => setF({ ...f, studioName: e.target.value })} placeholder="e.g. Osu Sound House" /></label>}
            </>
          )}
          <label className="label">Email<input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
          {mode === "signup" && <label className="label">Phone <span className="hint">optional — for MoMo & reminders</span><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label>}
          <label className="label">Password{mode === "signup" && <span className="hint">at least 10 characters</span>}<input className="input" type="password" required minLength={mode === "signup" ? 10 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <div className="small muted" style={{ textAlign: "center" }}>
          {mode === "login" ? <>New here? <Link className="gold" href={`/signup${safeNext ? `?next=${safeNext}` : ""}`}>Create an account</Link></> : <>Have an account? <Link className="gold" href="/login">Sign in</Link></>}
        </div>
      </div>
      {mode === "login" && (
        <div className="card flat tight stack" style={{ gap: 10 }}>
          <div className="row between"><b className="small">Demo accounts</b><span className="xs muted">development seed data</span></div>
          <div className="row wrap" style={{ gap: 6 }}>
            {DEMO.map(([label, email]) => (
              <button key={email} className="chip" disabled={busy} onClick={(e) => submit(e as unknown as React.FormEvent, { email, password: "soundroot-demo" })}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
