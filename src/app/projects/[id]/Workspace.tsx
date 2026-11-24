"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconDownload, IconLock, IconPause, IconPlay, IconUnlock, IconUpload } from "@/components/icons";
import { player, usePlayer, type Track } from "@/components/player-store";
import { api, Avatar, computePeaks, Modal, money, StatusBadge, Tabs, uploadWithProgress, useAsync, useToast } from "@/components/ui";
import { fmtTime, Spectrum, Waveform, type Marker } from "@/components/visuals";

type Project = any;

export function Workspace({ initial }: { initial: Project }) {
  const router = useRouter();
  const toast = useToast();
  const [p, setP] = useState<Project>(initial);
  const [vid, setVid] = useState<string>(initial.versions[0]?.id ?? "");
  const [tab, setTab] = useState<"feedback" | "messages" | "files">("feedback");
  const [text, setText] = useState("");
  const [pinTime, setPinTime] = useState(true);
  const [kind, setKind] = useState<"comment" | "revision_request">("comment");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const { busy, run } = useAsync();
  const v = p.versions.find((x: any) => x.id === vid) ?? p.versions[0];

  const refresh = async () => { const n = await api(`/api/v1/projects/${p.id}`); setP(n); return n; };

  const track: Track | null = v ? { id: `v:${v.id}`, title: `${p.title} — ${v.label}`, subtitle: `${p.studio.name} · v${v.number}`, src: v.streamUrl, hue: p.hue, artSeed: p.hue * 13 + v.number, waveform: v.waveform, href: `/projects/${p.id}`, kind: "version" } : null;
  const current = usePlayer((s) => s.track?.id === track?.id);
  const playing = usePlayer((s) => s.playing && s.track?.id === track?.id);
  const time = usePlayer((s) => (current ? s.time : 0));
  const duration = usePlayer((s) => (current ? s.duration : 0)) || (v?.durationMs ?? 0) / 1000;

  const play = () => track && player.toggle(track);
  const seekMs = (ms: number) => {
    if (!track) return;
    if (!current) player.play(track);
    setTimeout(() => player.seek(ms / 1000), current ? 0 : 250);
  };
  const colorFor = (name: string) => `hsl(${(name.charCodeAt(0) * 37) % 360} 75% 65%)`;
  const markers: Marker[] = useMemo(() => (v?.comments ?? []).filter((c: any) => c.timestamp_ms != null).map((c: any, i: number) => ({
    id: c.id, ms: c.timestamp_ms, color: c.kind === "revision_request" ? "var(--gold)" : colorFor(c.author), label: String(i + 1), title: `${c.author}: ${c.body}`,
  })), [v]);

  // Highlight the comment closest to the playhead.
  useEffect(() => {
    if (!current) return;
    const near = (v?.comments ?? []).find((c: any) => c.timestamp_ms != null && Math.abs(c.timestamp_ms / 1000 - time) < 1.2);
    if (near) setActiveComment(near.id);
  }, [time, current, v]);

  const postComment = () => run(async () => {
    await api(`/api/v1/versions/${v.id}/comments`, { method: "POST", json: { body: text, timestampMs: pinTime ? Math.round(time * 1000) : null, kind } });
    setText(""); setKind("comment");
    await refresh();
  }, kind === "revision_request" ? "Revision requested" : "Comment added");

  const approve = () => confirm(`Approve ${v.label}? This records your approval of this exact version.`) && run(async () => { await api(`/api/v1/versions/${v.id}/approve`, { method: "POST" }); await refresh(); }, `${v.label} approved`);
  const finalize = () => run(async () => { await api(`/api/v1/projects/${p.id}`, { method: "PATCH", json: { action: "finalize", versionId: v.id } }); await refresh(); }, "Marked as final delivery");
  const payBalance = () => run(async () => {
    const { orderId } = await api<{ orderId: string }>(`/api/v1/projects/${p.id}/pay`, { method: "POST" });
    const c = await api<{ checkoutUrl: string }>("/api/v1/payments/checkout", { method: "POST", json: { orderId, idempotencyKey: crypto.randomUUID() } });
    router.push(c.checkoutUrl);
  });
  const download = (assetId: string) => run(async () => { const { url } = await api<{ url: string }>(`/api/v1/projects/${p.id}/download/${assetId}`); window.location.href = url; await refresh(); });

  const approved = !!v?.approval;
  const due = p.priceMinor - p.paidMinor;

  return (
    <div className="stack lg">
      <header className="row between wrap fade-up" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 10 }}><Link href="/projects" className="eyebrow">Projects</Link><span className="muted">/</span><span className="muted small">{p.studio.name}</span></div>
          <h1>{p.title}</h1>
          <div className="row wrap text-2 small" style={{ gap: 14 }}>
            {p.members.map((m: any) => <span key={m.id} className="row" style={{ gap: 6 }}><Avatar name={m.name} size={22} hue={(m.name.charCodeAt(0) * 37) % 360} />{m.name} <span className="muted">· {m.role}</span></span>)}
            {p.dueDate && <span>Due {new Date(p.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <StatusBadge status={p.status} />
          {p.viewer.canUpload && <button className="btn btn-teal" onClick={() => setUploadOpen(true)}><IconUpload />Upload version</button>}
        </div>
      </header>

      {p.versions.length === 0 ? (
        <div className="empty">No versions yet. {p.viewer.canUpload ? "Upload the first mix to start the review." : "Your engineer will upload the first mix here."}</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 380px)", gap: 22, alignItems: "start" }}>
          <div className="stack lg">
            <div className="row wrap" style={{ gap: 8 }}>
              {p.versions.map((x: any) => (
                <button key={x.id} className={`version-pill ${x.id === v.id ? "on" : ""}`} onClick={() => setVid(x.id)}>
                  {x.label}{x.approval && <IconCheck width={14} className="teal" />}{x.id === p.finalVersionId && <span className="badge plum plain">Final</span>}
                </button>
              ))}
            </div>

            <div className="card stack" style={{ gap: 16, background: `linear-gradient(160deg, hsl(${p.hue} 50% 18% / .55), rgba(12,24,28,.75))` }}>
              <div className="row between wrap">
                <div className="row" style={{ gap: 14 }}>
                  <button className="pb-play" style={{ width: 54, height: 54 }} onClick={play} aria-label={playing ? "Pause" : `Play ${v.label}`}>{playing ? <IconPause /> : <IconPlay style={{ marginLeft: 3 }} />}</button>
                  <div>
                    <b style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{v.label}</b>
                    <div className="muted xs">v{v.number} · uploaded by {v.uploader} · {new Date(v.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </div>
                </div>
                <Spectrum hue={p.hue} bars={14} />
              </div>
              <div style={{ paddingTop: 12 }}>
                <Waveform peaks={v.waveform} progress={duration ? time / duration : 0} duration={duration} height={110} hue={p.hue} markers={markers} active={current}
                  onSeek={(f) => seekMs(f * duration * 1000)} onMarker={(m) => { setActiveComment(m.id); seekMs(m.ms); }} label={`Seek ${v.label}`} />
              </div>
              <div className="row between xs muted" style={{ marginTop: 6 }}>
                <span className="mono">{fmtTime(time)} / {fmtTime(duration)}</span>
                <span>Click the waveform to seek · markers are timestamped comments</span>
              </div>
              {v.notes && <div className="notice info small">“{v.notes}” — {v.uploader}</div>}
            </div>

            <div className="row between wrap">
              <Tabs value={tab} onChange={setTab} items={[{ value: "feedback", label: `Feedback (${v.comments.length})` }, { value: "messages", label: `Messages (${p.messages.length})` }, { value: "files", label: "Delivery" }]} />
              <span className="small muted">Revisions used {p.revisionsUsed}/{p.revisionAllowance}</span>
            </div>

            {tab === "feedback" && (
              <div className="stack">
                <div className="card flat tight stack" style={{ gap: 10 }}>
                  <textarea className="textarea" style={{ minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={pinTime ? `Comment at ${fmtTime(time)}…` : "General comment…"} aria-label="Comment" />
                  <div className="row wrap between">
                    <div className="row wrap" style={{ gap: 14 }}>
                      <label className="check"><input type="checkbox" checked={pinTime} onChange={(e) => setPinTime(e.target.checked)} />Pin to <span className="ts" style={{ marginLeft: 4 }}>{fmtTime(time)}</span></label>
                      {p.viewer.role === "artist" && !approved && <label className="check"><input type="checkbox" checked={kind === "revision_request"} onChange={(e) => setKind(e.target.checked ? "revision_request" : "comment")} />This is a revision request</label>}
                    </div>
                    <button className="btn btn-primary btn-sm" disabled={!text.trim() || busy} onClick={postComment}>Post</button>
                  </div>
                </div>
                {v.comments.length === 0 && <div className="muted small" style={{ padding: 10 }}>No feedback on this version yet.</div>}
                {v.comments.map((c: any, i: number) => (
                  <div key={c.id} className={`comment ${activeComment === c.id ? "active" : ""}`}>
                    {c.timestamp_ms != null ? <button className="ts" onClick={() => { setActiveComment(c.id); seekMs(c.timestamp_ms); }}>{fmtTime(c.timestamp_ms / 1000)}</button> : <span className="ts" style={{ opacity: 0.5 }}>—</span>}
                    <div>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <b className="small" style={{ color: colorFor(c.author) }}>{c.author}</b>
                        {c.kind === "revision_request" && <span className="badge warn">Revision request</span>}
                        <span className="xs muted">{new Date(c.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                        {c.timestamp_ms != null && <span className="xs muted">#{markers.findIndex((m) => m.id === c.id) + 1}</span>}
                      </div>
                      <div style={{ marginTop: 2 }}>{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "messages" && <Messages p={p} refresh={refresh} />}

            {tab === "files" && (
              <div className="card flat stack">
                <h3>Delivery package</h3>
                {p.package.length === 0 && <div className="muted small">Nothing finalized yet.</div>}
                {p.package.map((a: any) => (
                  <div key={a.id} className="row between">
                    <span className="row"><IconDownload width={16} />{a.filename} <span className="xs muted">{(a.size / 1048576).toFixed(1)} MB</span></span>
                    <button className="btn btn-sm" disabled={busy || (p.viewer.role === "artist" && !p.delivery.unlocked)} onClick={() => download(a.id)}>{p.viewer.role === "artist" && !p.delivery.unlocked ? <IconLock /> : <IconDownload />}Download</button>
                  </div>
                ))}
                {p.viewer.canUpload && <DeliverableUpload projectId={p.id} onDone={refresh} />}
                <a className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} href={`/api/v1/projects/${p.id}/export`}>Export project data (JSON)</a>
              </div>
            )}
          </div>

          <aside className="stack lg" style={{ position: "sticky", top: 90 }}>
            <div className="card stack">
              <div className="eyebrow">Review</div>
              {approved ? (
                <div className="notice ok"><b>{v.label} approved</b> by {v.approval.name}<div className="xs">{new Date(v.approval.created_at).toLocaleString()}</div></div>
              ) : p.viewer.canApprove ? (
                <>
                  <p className="small text-2">Happy with <b>{v.label}</b>? Approval is recorded against this exact version.</p>
                  <div className="row">
                    <button className="btn grow" onClick={() => { setTab("feedback"); setKind("revision_request"); setPinTime(true); toast("Add your revision notes — pin them to the moment in the song.", "info"); }} disabled={p.revisionsUsed >= p.revisionAllowance}>Request revision</button>
                    <button className="btn btn-teal grow" onClick={approve} disabled={busy}>Approve {v.label}</button>
                  </div>
                  {p.revisionsUsed >= p.revisionAllowance && <span className="xs muted">Revision allowance used — ask the studio about extra rounds.</span>}
                </>
              ) : (
                <p className="small muted">Waiting for the artist to review {v.label}.</p>
              )}
              {p.viewer.canFinalize && approved && v.id !== p.finalVersionId && <button className="btn btn-primary" onClick={finalize} disabled={busy}>Mark {v.label} as final delivery</button>}
            </div>

            <div className={`card stack lock ${p.delivery.unlocked ? "" : "locked"}`}>
              <div className="row between"><h3>Final master + stems</h3>{p.delivery.unlocked ? <IconUnlock className="teal" width={20} /> : <IconLock className="gold" width={20} />}</div>
              <div className="small" style={{ color: p.delivery.unlocked ? "var(--teal-2)" : "var(--gold)" }}>
                {p.delivery.unlocked ? "Unlocked — download from the Delivery tab." : !p.finalVersionId ? "Locked until a version is approved and marked final" : "Locked until the balance is paid"}
              </div>
              <div className="divider" />
              <div className="row between small"><span className="muted">Project price</span><span>{money(p.priceMinor)}</span></div>
              <div className="row between small"><span className="muted">Paid (verified)</span><span>{money(p.paidMinor)}</span></div>
              <div className="row between"><b>Balance</b><b className={due > 0 ? "gold" : "teal"}>{money(Math.max(0, due))}</b></div>
              {p.viewer.role === "artist" && due > 0 && <button className="btn btn-primary" onClick={payBalance} disabled={busy}>Pay balance with MoMo</button>}
              {p.viewer.role === "artist" && p.delivery.unlocked && <button className="btn btn-teal" onClick={() => setTab("files")}><IconDownload />Get your files</button>}
            </div>
            <div className="card flat stack small">
              <b>Deliverables</b>
              <span className="text-2">{p.deliverables}</span>
            </div>
          </aside>
        </div>
      )}

      <UploadVersion open={uploadOpen} onClose={() => setUploadOpen(false)} projectId={p.id} nextNumber={(p.versions[0]?.number ?? 0) + 1} onDone={async () => { const n = await refresh(); setVid(n.versions[0]?.id); }} />
    </div>
  );
}

function Messages({ p, refresh }: { p: Project; refresh: () => Promise<any> }) {
  const [body, setBody] = useState("");
  const { busy, run } = useAsync();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [p.messages.length]);
  return (
    <div className="card flat stack">
      <div className="stack" style={{ maxHeight: 380, overflowY: "auto", gap: 8 }}>
        {p.messages.length === 0 && <div className="muted small">Start the conversation — only project members and studio managers can see this thread.</div>}
        {p.messages.map((m: any) => (
          <div key={m.id} className={`msg ${m.author_id === p.viewer.id ? "mine" : ""}`}>
            <div className="xs muted">{m.author} · {new Date(m.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</div>
            {m.body}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => { await api(`/api/v1/projects/${p.id}/messages`, { method: "POST", json: { body } }); setBody(""); await refresh(); }); }}>
        <input className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" aria-label="Message" />
        <button className="btn btn-primary" disabled={!body.trim() || busy}>Send</button>
      </form>
    </div>
  );
}

function UploadVersion({ open, onClose, projectId, nextNumber, onDone }: { open: boolean; onClose: () => void; projectId: string; nextNumber: number; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState("");
  const toast = useToast();
  const submit = async () => {
    if (!file) return;
    try {
      setStage("Analysing audio…");
      const analysis = await computePeaks(file);
      const form = new FormData();
      form.set("file", file);
      form.set("label", label || `Mix v${nextNumber}`);
      form.set("notes", notes);
      if (analysis) { form.set("peaks", JSON.stringify(analysis.peaks)); form.set("durationMs", String(analysis.durationMs)); }
      setStage("Uploading…");
      await uploadWithProgress(`/api/v1/projects/${projectId}/versions`, form, setProgress);
      toast("New version uploaded — the artist has been notified", "ok");
      setFile(null); setLabel(""); setNotes(""); setProgress(null); setStage("");
      onClose(); onDone();
    } catch (e: any) {
      toast(e.message, "bad"); setProgress(null); setStage("");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Upload a new version">
      <div className="stack">
        <label className={`dropzone ${file ? "drag" : ""}`}>
          <input type="file" accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <IconUpload width={28} height={28} style={{ margin: "0 auto 8px" }} />
          <b>{file ? file.name : "Choose a WAV or MP3"}</b>
          <div className="muted small">{file ? `${(file.size / 1048576).toFixed(1)} MB` : "Up to 120 MB · checksummed and security-scanned"}</div>
        </label>
        <label className="label">Label<input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Mix v${nextNumber}`} /></label>
        <label className="label">Notes for the artist<textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed in this version?" /></label>
        {progress !== null && <div className="progress"><i style={{ width: `${progress * 100}%` }} /></div>}
        {stage && <span className="small muted">{stage}</span>}
        <button className="btn btn-teal" disabled={!file || !!stage} onClick={submit}>Upload version</button>
        <span className="xs muted">Every upload creates a new immutable version. Earlier versions and their comments are kept.</span>
      </div>
    </Modal>
  );
}

function DeliverableUpload({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const toast = useToast();
  return (
    <label className="btn btn-sm" style={{ justifySelf: "start" }}>
      <input type="file" hidden accept=".zip,.wav,.mp3" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const form = new FormData();
        form.set("file", f);
        try { await uploadWithProgress(`/api/v1/projects/${projectId}/deliverables`, form, setProgress); toast("Added to delivery package", "ok"); onDone(); } catch (err: any) { toast(err.message, "bad"); }
        setProgress(null);
      }} />
      <IconUpload />{progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Add stems / extra files"}
    </label>
  );
}
