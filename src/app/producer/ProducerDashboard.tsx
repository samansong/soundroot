"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Artwork } from "@/components/Artwork";
import { IconCheck, IconPlus, IconUpload } from "@/components/icons";
import { api, computePeaks, money, StatusBadge, Tabs, uploadWithProgress, useAsync, useToast } from "@/components/ui";
import { Waveform } from "@/components/visuals";

type Catalog = { profile: any; beats: any[]; stats: { published: number; sales: number; netMinor: number; availableMinor: number } };
type Tab = "catalog" | "upload" | "sales" | "payouts" | "profile";

export function ProducerDashboard() {
  const [tab, setTab] = useState<Tab>("catalog");
  const [data, setData] = useState<Catalog | null>(null);
  const [sales, setSales] = useState<{ rows: any[]; payouts: any[] } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [c, s] = await Promise.all([api<Catalog>("/api/v1/producer"), api("/api/v1/producer/sales")]);
    setData(c); setSales(s);
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Poll while any beat is processing audio.
  useEffect(() => {
    if (!data?.beats.some((b) => ["queued", "processing"].includes(b.processing))) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [data, load]);

  if (!data) return <div className="muted">Loading your catalog…</div>;
  return (
    <div className="stack lg">
      <header className="row between wrap">
        <div><div className="eyebrow">Producer studio</div><h1 style={{ marginTop: 10 }}>Your beat catalog</h1>{data.profile && <Link href={`/producers/${data.profile.slug}`} className="small muted">soundroot / {data.profile.slug} ↗</Link>}</div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setTab("upload"); }}><IconPlus />Upload beat</button>
      </header>
      <div className="grid cols-4">
        <div className="card stat"><div className="label-sm">Published</div><div className="value">{data.stats.published}</div></div>
        <div className="card stat"><div className="label-sm">Sales</div><div className="value">{data.stats.sales}</div></div>
        <div className="card stat"><div className="label-sm">Net earnings</div><div className="value gold">{money(data.stats.netMinor)}</div><div className="delta muted">after commission & fees</div></div>
        <div className="card stat"><div className="label-sm">Available to pay out</div><div className="value teal">{money(data.stats.availableMinor)}</div></div>
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: "catalog", label: "My beats" }, { value: "upload", label: editing ? "Edit beat" : "Upload" }, { value: "sales", label: "Sales" }, { value: "payouts", label: "Payouts" }, { value: "profile", label: "Profile" }]} />
      {tab === "catalog" && <CatalogTable beats={data.beats} reload={load} onEdit={(id) => { setEditing(id); setTab("upload"); }} />}
      {tab === "upload" && <UploadWizard key={editing ?? "new"} beat={data.beats.find((b) => b.id === editing)} reload={load} done={() => { setEditing(null); setTab("catalog"); }} />}
      {tab === "sales" && sales && <Sales rows={sales.rows} />}
      {tab === "payouts" && sales && <Payouts data={data} payouts={sales.payouts} reload={load} />}
      {tab === "profile" && <Profile profile={data.profile} reload={load} />}
    </div>
  );
}

function CatalogTable({ beats, reload, onEdit }: { beats: any[]; reload: () => void; onEdit: (id: string) => void }) {
  const { busy, run } = useAsync();
  const act = (id: string, action: string) => run(async () => { await api(`/api/v1/beats/${id}`, { method: "PATCH", json: { action } }); await reload(); }, `Beat ${action}ed`);
  if (beats.length === 0) return <div className="empty">No beats yet — upload your first one.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Title / genre</th><th>From</th><th>Plays</th><th>Sales</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {beats.map((b) => (
            <tr key={b.id}>
              <td>
                <div className="row" style={{ gap: 12 }}>
                  <Artwork seed={b.artSeed} hue={b.hue} size={44} radius={10} />
                  <div><Link href={`/beats/${b.id}`} style={{ fontWeight: 750 }}>{b.title}</Link><div className="xs muted">{b.genre} · {b.bpm} BPM · {b.key}</div></div>
                </div>
              </td>
              <td>{b.fromMinor ? money(b.fromMinor) : "—"}</td>
              <td>{b.plays}</td>
              <td>{b.sales}</td>
              <td>
                <StatusBadge status={b.status} />
                {["queued", "processing"].includes(b.processing) && <div className="xs muted" style={{ marginTop: 4 }}>Processing audio…</div>}
              </td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {["draft", "unpublished"].includes(b.status) && <button className="btn btn-sm" onClick={() => onEdit(b.id)}>Edit</button>}{" "}
                {b.status === "published" && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(b.id, "unpublish")}>Unpublish</button>}
                {b.status === "unpublished" && <button className="btn btn-sm btn-teal" disabled={busy} onClick={() => act(b.id, "publish")}>Republish</button>}
                {["draft", "unpublished"].includes(b.status) && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => confirm("Archive this beat?") && act(b.id, "archive")}>Archive</button>}
                {b.status === "exclusive_sold" && <span className="xs muted">Locked — exclusive sold</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="xs muted">Exclusive-sold listings can’t be republished. Existing non-exclusive licenses stay valid on their original terms.</p>
    </div>
  );
}

const TIERS = [
  { tier: "free", name: "Free promo", hint: "MP3 · non-commercial", def: 0 },
  { tier: "basic", name: "Basic lease", hint: "MP3 · 2k units", def: 120 },
  { tier: "premium", name: "Premium lease", hint: "WAV · 10k units", def: 250 },
  { tier: "unlimited", name: "Unlimited lease", hint: "WAV + stems", def: 600 },
  { tier: "exclusive", name: "Exclusive", hint: "Removes the beat from store", def: 3500 },
];
const STEPS = ["Details", "Audio", "Licenses", "Preview", "Publish"];

function UploadWizard({ beat, reload, done }: { beat?: any; reload: () => Promise<void>; done: () => void }) {
  const toast = useToast();
  const { busy, run } = useAsync();
  const [step, setStep] = useState(beat ? (beat.hasAudio ? 2 : 1) : 0);
  const [id, setId] = useState<string | null>(beat?.id ?? null);
  const [meta, setMeta] = useState({ title: beat?.title ?? "", genre: beat?.genre ?? "Afrobeats", mood: "", bpm: beat?.bpm ?? 100, key: beat?.key ?? "A minor", description: "" });
  const [tiers, setTiers] = useState(TIERS.map((t) => {
    const cur = beat?.licenses?.find((l: any) => l.tier === t.tier);
    return { tier: t.tier, enabled: beat ? !!cur : t.tier !== "free", price: cur ? cur.price_minor / 100 : t.def };
  }));
  const [progress, setProgress] = useState<Record<string, number | null>>({});
  const [declare, setDeclare] = useState(false);
  const [state, setState] = useState<any>(beat ?? null);

  const refreshBeat = async (bid = id) => {
    const c = await api<Catalog>("/api/v1/producer");
    const b = c.beats.find((x) => x.id === bid);
    setState(b);
    return b;
  };
  useEffect(() => {
    if (!id || !state || !["queued", "processing"].includes(state.processing)) return;
    const t = setInterval(() => void refreshBeat(), 1200);
    return () => clearInterval(t);
  });

  const saveMeta = () => run(async () => {
    if (id) await api(`/api/v1/beats/${id}`, { method: "PATCH", json: { action: "update", data: meta } });
    else { const r = await api<{ id: string }>("/api/v1/beats", { method: "POST", json: meta }); setId(r.id); await refreshBeat(r.id); }
    setStep(1);
  });
  const upload = async (kind: "master" | "stems", f: File) => {
    const form = new FormData();
    form.set("file", f);
    form.set("kind", kind);
    if (kind === "master") { const a = await computePeaks(f); if (a) form.set("peaks", JSON.stringify(a.peaks)); }
    try {
      await uploadWithProgress(`/api/v1/beats/${id}/audio`, form, (p) => setProgress((s) => ({ ...s, [kind]: p })));
      toast(kind === "master" ? "Audio uploaded — generating tagged preview" : "Stems uploaded", "ok");
      await refreshBeat();
    } catch (e: any) { toast(e.message, "bad"); }
    setProgress((s) => ({ ...s, [kind]: null }));
  };
  const saveLicenses = () => run(async () => { await api(`/api/v1/beats/${id}`, { method: "PATCH", json: { action: "licenses", data: tiers } }); await refreshBeat(); setStep(3); });
  const publish = () => run(async () => { await api(`/api/v1/beats/${id}`, { method: "PATCH", json: { action: "publish", declareOwnership: declare } }); await reload(); done(); }, "Published! Your beat is live.");

  return (
    <div className="card stack lg">
      <div className="steps">{STEPS.map((s, i) => <button key={s} className={`step ${i === step ? "on" : ""} ${i < step ? "done" : ""}`} style={{ background: "none", cursor: id || i === 0 ? "pointer" : "default" }} onClick={() => (id || i === 0) && setStep(i)}><i>{i < step ? "✓" : i + 1}</i>{s}</button>)}</div>

      {step === 0 && (
        <div className="stack">
          <div className="field-row">
            <label className="label">Title<input className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></label>
            <label className="label">Genre
              <select className="select" value={meta.genre} onChange={(e) => setMeta({ ...meta, genre: e.target.value })}>
                {["Afrobeats", "Amapiano", "Highlife", "Hiplife", "Asakaa Drill", "Gospel", "Afro House", "Afro Soul", "Alté", "Azonto"].map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="label">Mood<input className="input" value={meta.mood} onChange={(e) => setMeta({ ...meta, mood: e.target.value })} placeholder="e.g. Late night" /></label>
          </div>
          <div className="field-row">
            <label className="label">BPM<input className="input" type="number" min={40} max={220} value={meta.bpm} onChange={(e) => setMeta({ ...meta, bpm: Number(e.target.value) })} /></label>
            <label className="label">Key<input className="input" value={meta.key} onChange={(e) => setMeta({ ...meta, key: e.target.value })} placeholder="A minor" /></label>
          </div>
          <label className="label">Description<textarea className="textarea" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></label>
          <button className="btn btn-primary" style={{ justifySelf: "start" }} disabled={busy || meta.title.length < 2} onClick={saveMeta}>Save & continue</button>
        </div>
      )}

      {step === 1 && (
        <div className="grid cols-2">
          {(["master", "stems"] as const).map((kind) => (
            <label key={kind} className="dropzone">
              <input type="file" hidden accept={kind === "master" ? ".wav,.mp3,audio/wav,audio/mpeg" : ".zip,application/zip"} onChange={(e) => e.target.files?.[0] && upload(kind, e.target.files[0])} />
              <IconUpload width={28} height={28} style={{ margin: "0 auto 8px" }} />
              <b>{kind === "master" ? "Beat audio (WAV or MP3)" : "Stems / trackouts (ZIP, optional)"}</b>
              <div className="muted small">{kind === "master" ? "Up to 120 MB. We generate a tagged, compressed preview automatically." : "Required for Unlimited and Exclusive tiers. Up to 500 MB."}</div>
              {progress[kind] != null && <div className="progress" style={{ marginTop: 12 }}><i style={{ width: `${(progress[kind] ?? 0) * 100}%` }} /></div>}
              {kind === "master" && state?.hasAudio && <div className="badge ok" style={{ marginTop: 10 }}>{["queued", "processing"].includes(state.processing) ? "Processing…" : state.processing === "failed" ? "Processing failed" : "Audio ready"}</div>}
              {kind === "stems" && state?.hasStems && <div className="badge ok" style={{ marginTop: 10 }}>Stems uploaded</div>}
            </label>
          ))}
          <button className="btn btn-primary" style={{ justifySelf: "start" }} disabled={!state?.hasAudio} onClick={() => setStep(2)}>Continue to licenses</button>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <p className="muted small">Each saved change creates a new immutable license version. Buyers keep the exact terms they accepted.</p>
          {TIERS.map((t, i) => (
            <div key={t.tier} className="row card flat tight" style={{ gap: 14 }}>
              <label className="check grow"><input type="checkbox" checked={tiers[i].enabled} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} /><span><b>{t.name}</b><div className="xs muted">{t.hint}</div></span></label>
              {t.tier !== "free" && <label className="row small" style={{ gap: 8 }}>GHS<input className="input" style={{ width: 120 }} type="number" min={1} value={tiers[i].price} disabled={!tiers[i].enabled} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} /></label>}
            </div>
          ))}
          <button className="btn btn-primary" style={{ justifySelf: "start" }} disabled={busy} onClick={saveLicenses}>Save licenses</button>
        </div>
      )}

      {step === 3 && state && (
        <div className="stack">
          <div className="row" style={{ gap: 16 }}>
            <Artwork seed={state.artSeed} hue={state.hue} size={110} />
            <div className="grow stack" style={{ gap: 6 }}>
              <h3>{state.title}</h3>
              <div className="muted small">{state.genre} · {state.bpm} BPM · {state.key}</div>
              <Waveform peaks={state.waveform} progress={0} duration={0} height={50} hue={state.hue} active={false} />
              <div className="row wrap" style={{ gap: 6 }}>{state.licenses.map((l: any) => <span key={l.tier} className="badge neutral plain">{l.tier} · {money(l.price_minor)}</span>)}</div>
            </div>
          </div>
          {["queued", "processing"].includes(state.processing) && <div className="notice info">Generating tagged preview and waveform…</div>}
          <button className="btn btn-primary" style={{ justifySelf: "start" }} onClick={() => setStep(4)}>Looks good</button>
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          <label className="check"><input type="checkbox" checked={declare} onChange={(e) => setDeclare(e.target.checked)} />I declare that I own or control all rights in this beat, including any samples, and I can grant the licenses offered. I understand infringing listings are taken down.</label>
          <div className="row">
            <button className="btn btn-primary" disabled={!declare || busy} onClick={publish}><IconCheck />Publish</button>
            <button className="btn btn-ghost" onClick={done}>Save as draft</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Sales({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="empty">No sales yet. Share your storefront link to get started.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Order</th><th>License</th><th>Gross</th><th>Commission</th><th>Processing</th><th>Net</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reference}>
              <td className="mono">{r.reference}<div className="xs muted">{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : ""}</div></td>
              <td className="text-2">{r.description}</td>
              <td>{money(r.price_minor)}</td>
              <td className="muted">−{money(r.platform_fee)}</td>
              <td className="muted">−{money(r.provider_fee)}</td>
              <td className="gold" style={{ fontWeight: 800 }}>{money(r.net)}</td>
              <td><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Payouts({ data, payouts, reload }: { data: Catalog; payouts: any[]; reload: () => void }) {
  const { busy, run } = useAsync();
  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="card stack">
        <h3>Withdraw to Mobile Money</h3>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "2.4rem", fontWeight: 700 }} className="teal">{money(data.stats.availableMinor)}</div>
        {!data.profile?.payoutVerified ? (
          <>
            <div className="notice warn">Payouts need a one-time identity check with our payment provider.</div>
            <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { await api("/api/v1/producer/payouts", { method: "POST", json: { action: "verify" } }); await reload(); }, "Identity verified")}>Verify identity (sandbox)</button>
          </>
        ) : (
          <button className="btn btn-primary" disabled={busy || data.stats.availableMinor < 1000} onClick={() => run(async () => { await api("/api/v1/producer/payouts", { method: "POST", json: { action: "request" } }); await reload(); }, "Payout sent")}>Request payout</button>
        )}
        <span className="xs muted">Minimum GHS 10. Funds are held and settled by the licensed payment provider — SoundRoot never holds your money directly.</span>
      </div>
      <div className="card stack">
        <h3>Payout history</h3>
        {payouts.length === 0 && <div className="muted small">No payouts yet.</div>}
        {payouts.map((p) => <div key={p.id} className="row between"><span>{new Date(p.created_at).toLocaleDateString()}</span><b>{money(p.amount_minor)}</b><StatusBadge status={p.status} /></div>)}
      </div>
    </div>
  );
}

function Profile({ profile, reload }: { profile: any; reload: () => void }) {
  const [f, setF] = useState({ displayName: profile?.displayName ?? "", bio: profile?.bio ?? "", city: profile?.city ?? "" });
  const { busy, run } = useAsync();
  return (
    <div className="card stack" style={{ maxWidth: 640 }}>
      <label className="label">Producer name<input className="input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></label>
      <label className="label">City<input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
      <label className="label">Bio<textarea className="textarea" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
      <button className="btn btn-primary" style={{ justifySelf: "start" }} disabled={busy} onClick={() => run(async () => { await api("/api/v1/producer", { method: "PATCH", json: f }); await reload(); }, "Profile saved")}>Save profile</button>
    </div>
  );
}
