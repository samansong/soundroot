"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { beatTrack, type BeatLite } from "@/components/beats";
import { IconFlag, IconPause, IconPlay } from "@/components/icons";
import { player, usePlayer } from "@/components/player-store";
import { api, Modal, money, useAsync } from "@/components/ui";
import { fmtTime, Spectrum, Waveform } from "@/components/visuals";

interface License {
  id: string; tier: string; name: string; priceMinor: number; currency: string; version: number;
  terms: { summary: string; permittedUses: string[]; distributionLimit: number | null; streamLimit: number | null; musicVideos: number | null; commercial: boolean; creditRequired: string; term: string; territory: string; includedFiles: string[]; exclusive: boolean };
}
type Beat = BeatLite & { licenses: License[]; status: string; exclusiveOnHold: boolean; isOwner: boolean; durationMs: number | null };

export function BeatHeroPlayer({ beat }: { beat: Beat }) {
  const current = usePlayer((s) => s.track?.id === beat.id);
  const playing = usePlayer((s) => s.playing && s.track?.id === beat.id);
  const time = usePlayer((s) => (current ? s.time : 0));
  const duration = usePlayer((s) => (current ? s.duration : 0)) || (beat.durationMs ? Math.min(30, beat.durationMs / 1000) : 30);
  if (!beat.previewUrl) return <div className="notice warn">Preview is still processing.</div>;
  return (
    <div className="glass" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div className="row" style={{ gap: 14 }}>
        <button className="pb-play" style={{ width: 56, height: 56 }} onClick={() => player.toggle(beatTrack(beat))} aria-label={playing ? "Pause preview" : "Play preview"}>
          {playing ? <IconPause /> : <IconPlay style={{ marginLeft: 3 }} />}
        </button>
        <div className="grow">
          <Waveform peaks={beat.waveform} progress={duration ? time / duration : 0} duration={duration} height={64} hue={beat.hue} active={current}
            onSeek={(f) => (current ? player.seekFraction(f) : player.play(beatTrack(beat)))} label={`Seek ${beat.title} preview`} />
        </div>
        <Spectrum hue={beat.hue} bars={10} className="pb-spectrum" />
      </div>
      <div className="row between xs muted"><span>{fmtTime(time)} / {fmtTime(duration)}</span><span>Tagged 30-second preview · full untagged files come with your license</span></div>
    </div>
  );
}

const lim = (n: number | null) => (n === null ? "Unlimited" : n === 0 ? "None" : n.toLocaleString());

export function LicensePicker({ beat, signedIn }: { beat: Beat; signedIn: boolean }) {
  const router = useRouter();
  const paid = beat.licenses.filter((l) => l.priceMinor > 0);
  const [sel, setSel] = useState<string | null>((paid[1] ?? paid[0] ?? beat.licenses[0])?.id ?? null);
  const [accept, setAccept] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { busy, run } = useAsync();
  const chosen = beat.licenses.find((l) => l.id === sel);
  const available = beat.status === "published" && !beat.isOwner;

  const checkout = () => run(async () => {
    if (!signedIn) { router.push(`/login?next=/beats/${beat.id}`); return; }
    const o = await api<{ orderId: string; free: boolean }>("/api/v1/orders", { method: "POST", json: { licenseVersionId: sel, acceptTerms: accept } });
    if (o.free) { router.push(`/orders/${o.orderId}`); return; }
    const c = await api<{ checkoutUrl: string }>("/api/v1/payments/checkout", { method: "POST", json: { orderId: o.orderId, idempotencyKey: crypto.randomUUID(), method: "momo" } });
    router.push(c.checkoutUrl);
  });

  return (
    <div className="stack lg">
      <div className="license-grid">
        {beat.licenses.map((l) => {
          const blocked = l.tier === "exclusive" && beat.exclusiveOnHold;
          return (
            <button key={l.id} className={`license ${sel === l.id ? "on" : ""} ${blocked ? "disabled" : ""}`} onClick={() => !blocked && setSel(l.id)} aria-pressed={sel === l.id} disabled={blocked}>
              <div className="row between"><b>{l.name}</b>{l.tier === "exclusive" && <span className="badge plum plain">1 available</span>}</div>
              <div className="lprice">{l.priceMinor === 0 ? "Free" : money(l.priceMinor, l.currency)}</div>
              <div className="small text-2">{l.terms.summary}</div>
              <ul>
                <li>{l.terms.includedFiles.map((f) => f.toUpperCase()).join(" + ")}</li>
                <li className={l.terms.commercial ? "" : "no"}>{l.terms.commercial ? "Commercial use" : "Non-commercial only"}</li>
                <li>{lim(l.terms.streamLimit)} streams</li>
                <li>{l.terms.term} · {l.terms.territory}</li>
              </ul>
            </button>
          );
        })}
      </div>

      {chosen && (
        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)", gap: 18 }}>
          <div className="card flat table-wrap">
            <h3 style={{ marginBottom: 12 }}>Full license comparison</h3>
            <table className="compare">
              <thead><tr><th>Term</th>{beat.licenses.map((l) => <th key={l.id} style={l.id === sel ? { color: "var(--gold)" } : undefined}>{l.name}</th>)}</tr></thead>
              <tbody>
                {[
                  ["Files", (l: License) => l.terms.includedFiles.map((f) => f.toUpperCase()).join(", ")],
                  ["Distribution (units)", (l: License) => lim(l.terms.distributionLimit)],
                  ["Audio streams", (l: License) => lim(l.terms.streamLimit)],
                  ["Music videos", (l: License) => lim(l.terms.musicVideos)],
                  ["Commercial", (l: License) => (l.terms.commercial ? "Yes" : "No")],
                  ["Term", (l: License) => l.terms.term],
                  ["Exclusive", (l: License) => (l.terms.exclusive ? "Yes — beat leaves the store" : "No")],
                ].map(([label, fn]) => (
                  <tr key={label as string}><td className="muted">{label as string}</td>{beat.licenses.map((l) => <td key={l.id}>{(fn as (l: License) => string)(l)}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <p className="xs muted" style={{ marginTop: 12 }}>Credit required on all tiers: {chosen.terms.creditRequired}. A license grants usage rights — it is not an assignment of copyright.</p>
          </div>
          <div className="card stack" style={{ alignContent: "start", position: "sticky", top: 90 }}>
            <div className="eyebrow">Your selection</div>
            <div className="row between"><b style={{ fontSize: "1.1rem" }}>{chosen.name}</b><span className="xs muted">v{chosen.version}</span></div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", fontWeight: 700 }}>{chosen.priceMinor ? money(chosen.priceMinor) : "Free"}</div>
            <div className="muted small">Pay with Mobile Money (MTN, Telecel, AirtelTigo) or card. License PDF and downloads unlock as soon as the payment is verified.</div>
            {available ? (
              <>
                <label className="check"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />I have read and accept the {chosen.name} terms (version {chosen.version}).</label>
                <button className="btn btn-primary btn-lg" disabled={!accept || busy} onClick={checkout}>
                  {busy ? "Starting checkout…" : chosen.priceMinor ? `Buy ${chosen.name}` : "Get free license"}
                </button>
                {!signedIn && <span className="xs muted">You'll sign in before paying. Previews are free for everyone.</span>}
              </>
            ) : (
              <div className="notice info">{beat.isOwner ? "This is your beat — manage it from your producer dashboard." : "This beat isn't available for new licenses."}</div>
            )}
            <button className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => (signedIn ? setReportOpen(true) : router.push("/login"))}><IconFlag />Report infringement</button>
          </div>
        </div>
      )}

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this beat">
        <div className="stack">
          <p className="muted small">Tell us which rights you believe are infringed (e.g. uncleared sample, stolen beat). Our moderators review every report and keep an audit record.</p>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the issue…" />
          <button className="btn btn-primary" disabled={busy || reason.length < 10} onClick={() => run(async () => { await api(`/api/v1/beats/${beat.id}/report`, { method: "POST", json: { reason } }); setReportOpen(false); setReason(""); }, "Report sent to moderation")}>Send report</button>
        </div>
      </Modal>
    </div>
  );
}
