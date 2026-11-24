// Project workspace: lifecycle, immutable audio versions, timestamped feedback, approvals, gated delivery (PR-01..PR-06).
import { z } from "zod";
import { all, insert, now, one, run, tx, uuid } from "../db.ts";
import { type Actor, hasRole, membershipFor, requireActor, requireStudio } from "../auth.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { audit, notify } from "../audit.ts";
import { MAX_AUDIO_BYTES, MAX_ZIP_BYTES, putObject, signUrl, sniff } from "../storage.ts";
import { decodeWav, durationMs, peaks } from "../audio/wav.ts";

type Access = { actor: Actor; project: any; role: "artist" | "engineer" | "manager" | "admin" };

function access(actorIn: Actor | null, projectId: string): Access {
  const actor = requireActor(actorIn);
  const project = one("SELECT * FROM projects WHERE id=?", projectId);
  if (!project) throw notFound("Project not found");
  const member = one<{ role: "artist" | "engineer" }>("SELECT role FROM project_members WHERE project_id=? AND user_id=?", projectId, actor.id);
  const m = membershipFor(actor, project.studio_id);
  if (m && m.role !== "engineer") return { actor, project, role: "manager" };
  if (member) {
    // Engineers must still be active studio staff — revocation is immediate.
    if (member.role === "engineer" && !m) throw notFound("Project not found");
    return { actor, project, role: member.role };
  }
  throw notFound("Project not found"); // never leak existence across tenants
}

const isTeam = (r: Access["role"]) => r === "engineer" || r === "manager";

export function listProjects(actorIn: Actor | null) {
  const actor = requireActor(actorIn);
  const managed = actor.memberships.filter((m) => m.role !== "engineer").map((m) => m.studioId);
  const placeholders = managed.map(() => "?").join(",") || "''";
  return all(
    `SELECT p.id, p.title, p.status, p.due_date, p.hue, p.price_minor, p.paid_minor, p.revision_allowance, p.revisions_used, p.created_at,
       s.name studio_name, c.name client_name,
       (SELECT name FROM users u JOIN project_members pm ON pm.user_id=u.id WHERE pm.project_id=p.id AND pm.role='engineer' LIMIT 1) engineer_name,
       (SELECT COUNT(*) FROM audio_versions WHERE project_id=p.id) versions,
       (SELECT waveform_json FROM audio_versions WHERE project_id=p.id ORDER BY version_number DESC LIMIT 1) waveform_json
     FROM projects p JOIN studios s ON s.id=p.studio_id LEFT JOIN clients c ON c.id=p.client_id
     WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id=?) OR p.studio_id IN (${placeholders})
     ORDER BY CASE p.status WHEN 'in_review' THEN 0 WHEN 'active' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, p.due_date`,
    actor.id, ...managed,
  ).map((p) => ({ ...p, waveform: p.waveform_json ? JSON.parse(p.waveform_json) : null, waveform_json: undefined }));
}

export const projectInput = z.object({
  studioId: z.string().uuid(),
  title: z.string().trim().min(2).max(100),
  clientId: z.string().uuid(),
  engineerId: z.string().uuid().optional().nullable(),
  bookingId: z.string().uuid().optional().nullable(),
  deliverables: z.string().max(1000).default("Mixed & mastered WAV, instrumental, stems"),
  revisionAllowance: z.coerce.number().int().min(0).max(20).default(2),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  priceMajor: z.coerce.number().min(0).default(0),
});

export function createProject(actorIn: Actor | null, input: unknown) {
  const d = projectInput.parse(input);
  const { actor } = requireStudio(actorIn, d.studioId, "manager");
  return tx(() => {
    const client = one("SELECT * FROM clients WHERE id=? AND studio_id=?", d.clientId, d.studioId);
    if (!client) throw notFound("Client not found");
    if (d.engineerId && !one("SELECT 1 FROM memberships WHERE studio_id=? AND user_id=? AND revoked_at IS NULL", d.studioId, d.engineerId)) throw badRequest("Engineer is not on your team");
    if (d.bookingId && !one("SELECT 1 FROM bookings WHERE id=? AND studio_id=?", d.bookingId, d.studioId)) throw notFound("Booking not found");
    const id = uuid();
    insert("projects", {
      id, studio_id: d.studioId, booking_id: d.bookingId ?? null, client_id: d.clientId, title: d.title, deliverables: d.deliverables,
      revision_allowance: d.revisionAllowance, due_date: d.dueDate ?? null, price_minor: Math.round(d.priceMajor * 100), status: "active",
      hue: Math.floor(Math.random() * 360), created_at: now(),
    });
    if (client.user_id) {
      insert("project_members", { project_id: id, user_id: client.user_id, role: "artist" });
      notify(client.user_id, "project", "You've been added to a project", d.title, `/projects/${id}`);
    }
    if (d.engineerId) {
      insert("project_members", { project_id: id, user_id: d.engineerId, role: "engineer" });
      if (d.engineerId !== actor.id) notify(d.engineerId, "project", "New project assigned", d.title, `/projects/${id}`);
    }
    audit(actor.id, "project.create", "project", id);
    return { id };
  });
}

export function getProject(actorIn: Actor | null, id: string) {
  const { actor, project: p, role } = access(actorIn, id);
  const studio = one("SELECT id, name, slug, hue FROM studios WHERE id=?", p.studio_id)!;
  const members = all("SELECT u.id, u.name, pm.role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE project_id=?", id);
  const client = p.client_id ? one("SELECT id, name FROM clients WHERE id=?", p.client_id) : null; // private notes never exposed here
  const versions = all("SELECT v.*, u.name uploader FROM audio_versions v JOIN users u ON u.id=v.uploaded_by WHERE project_id=? ORDER BY version_number DESC", id).map((v) => ({
    id: v.id, number: v.version_number, label: v.label, notes: v.notes, durationMs: v.duration_ms, createdAt: v.created_at, uploader: v.uploader,
    waveform: v.waveform_json ? JSON.parse(v.waveform_json) : null,
    // Streaming URL for in-app review only; originals are never public.
    streamUrl: signUrl(v.asset_id, 60 * 60),
    approval: one("SELECT a.created_at, u.name FROM approvals a JOIN users u ON u.id=a.user_id WHERE version_id=?", v.id) ?? null,
    comments: all("SELECT c.id, c.body, c.timestamp_ms, c.kind, c.created_at, u.name author, u.id author_id FROM comments c JOIN users u ON u.id=c.author_id WHERE version_id=? ORDER BY COALESCE(timestamp_ms, 1e12), c.created_at", v.id),
  }));
  const messages = all("SELECT m.id, m.body, m.created_at, u.name author, u.id author_id FROM project_messages m JOIN users u ON u.id=m.author_id WHERE project_id=? ORDER BY m.created_at", id);
  const pkg = (JSON.parse(p.package_json) as string[]).map((aid) => one("SELECT id, filename, size, kind FROM assets WHERE id=?", aid)).filter(Boolean);
  const settled = p.paid_minor >= p.price_minor;
  const unlocked = !!p.final_version_id && settled && ["approved", "delivered"].includes(p.status);
  const pendingOrder = one("SELECT id FROM orders WHERE project_id=? AND buyer_id=? AND status IN ('pending','processing') ORDER BY created_at DESC LIMIT 1", id, actor.id);
  return {
    id: p.id, title: p.title, status: p.status, deliverables: p.deliverables, dueDate: p.due_date, hue: p.hue,
    revisionAllowance: p.revision_allowance, revisionsUsed: p.revisions_used, priceMinor: p.price_minor, paidMinor: p.paid_minor,
    finalVersionId: p.final_version_id, studio, client, members, versions, messages, package: pkg,
    delivery: { settled, unlocked, pendingOrderId: pendingOrder?.id ?? null },
    viewer: { id: actor.id, role, canUpload: isTeam(role), canApprove: role === "artist", canFinalize: isTeam(role) },
  };
}

export function addVersion(actorIn: Actor | null, projectId: string, file: { name: string; type: string; data: Uint8Array }, meta: { label?: string; notes?: string; peaks?: number[]; durationMs?: number }) {
  const { actor, project, role } = access(actorIn, projectId);
  if (!isTeam(role)) throw forbidden("Only the production team uploads versions");
  if (["delivered", "archived"].includes(project.status)) throw conflict("Project is closed");
  const kind = sniff(file.data);
  if (kind !== "wav" && kind !== "mp3") throw badRequest("Versions must be WAV or MP3 audio");
  if (file.data.byteLength > MAX_AUDIO_BYTES) throw badRequest("File exceeds the 120 MB limit");
  const used = one<{ v: number }>("SELECT COALESCE(SUM(a.size),0) v FROM audio_versions v JOIN assets a ON a.id=v.asset_id WHERE v.project_id=?", projectId)!.v;
  if (used + file.data.byteLength > 2 * 1024 * 1024 * 1024) throw badRequest("Project storage quota (2 GB) reached");
  return tx(() => {
    const obj = putObject({ ownerId: actor.id, kind: "version", filename: file.name, mime: kind === "wav" ? "audio/wav" : "audio/mpeg", data: file.data });
    if (obj.scanStatus !== "clean") throw badRequest("File failed the security scan and was quarantined");
    let wf: number[] | null = null;
    let dur: number | null = null;
    if (kind === "wav") {
      try { const pcm = decodeWav(file.data); wf = peaks(pcm); dur = durationMs(pcm); } catch { /* fall back to client peaks */ }
    }
    if (!wf && meta.peaks?.length) wf = meta.peaks.slice(0, 400).map((n) => Math.max(0, Math.min(1, Number(n) || 0)));
    dur ??= meta.durationMs ?? null;
    const n = one<{ n: number }>("SELECT COALESCE(MAX(version_number),0) n FROM audio_versions WHERE project_id=?", projectId)!.n + 1;
    const id = uuid();
    insert("audio_versions", { id, project_id: projectId, asset_id: obj.id, version_number: n, label: (meta.label || `Mix v${n}`).slice(0, 60), notes: (meta.notes ?? "").slice(0, 500), waveform_json: wf ? JSON.stringify(wf) : null, duration_ms: dur, uploaded_by: actor.id, created_at: now() });
    run("UPDATE projects SET status='in_review' WHERE id=? AND status IN ('draft','active','in_review')", projectId);
    for (const m of all("SELECT user_id FROM project_members WHERE project_id=? AND user_id != ?", projectId, actor.id)) notify(m.user_id, "project", `New version: ${meta.label || `Mix v${n}`}`, project.title, `/projects/${projectId}`);
    audit(actor.id, "project.version", "audio_version", id, { checksum: obj.checksum });
    return { id, number: n };
  });
}

function versionAccess(actorIn: Actor | null, versionId: string) {
  const v = one("SELECT * FROM audio_versions WHERE id=?", versionId);
  if (!v) throw notFound("Version not found");
  return { v, ...access(actorIn, v.project_id) };
}

export function addComment(actorIn: Actor | null, versionId: string, input: unknown) {
  const { v, actor, project, role } = versionAccess(actorIn, versionId);
  const d = z.object({ body: z.string().trim().min(1).max(2000), timestampMs: z.coerce.number().int().min(0).max(4 * 3600_000).nullable().optional(), kind: z.enum(["comment", "revision_request"]).default("comment") }).parse(input);
  if (d.timestampMs != null && v.duration_ms && d.timestampMs > v.duration_ms) throw badRequest("Timestamp is past the end of this version");
  return tx(() => {
    if (d.kind === "revision_request") {
      if (role !== "artist") throw forbidden("Only the artist requests revisions");
      if (one("SELECT 1 FROM approvals WHERE version_id=?", versionId)) throw conflict("This version is already approved");
      if (project.revisions_used >= project.revision_allowance) throw conflict(`Revision allowance (${project.revision_allowance}) used — talk to the studio about extra revisions`, "revisions_exhausted");
      run("UPDATE projects SET revisions_used = revisions_used + 1, status='active' WHERE id=?", project.id);
    }
    const id = uuid();
    insert("comments", { id, version_id: versionId, author_id: actor.id, body: d.body, timestamp_ms: d.timestampMs ?? null, kind: d.kind, created_at: now() });
    for (const m of all("SELECT user_id FROM project_members WHERE project_id=? AND user_id != ?", project.id, actor.id))
      notify(m.user_id, "project", d.kind === "revision_request" ? "Revision requested" : "New comment", `${project.title}: ${d.body.slice(0, 80)}`, `/projects/${project.id}`);
    return { id };
  });
}

/** Approval binds to the exact version id and is recorded server-side (auditable). */
export function approveVersion(actorIn: Actor | null, versionId: string) {
  const { v, actor, project, role } = versionAccess(actorIn, versionId);
  if (role !== "artist") throw forbidden("Only the project artist can approve");
  return tx(() => {
    if (one("SELECT 1 FROM approvals WHERE version_id=?", versionId)) throw conflict("Already approved");
    insert("approvals", { id: uuid(), version_id: versionId, user_id: actor.id, created_at: now() });
    run("UPDATE projects SET status='approved' WHERE id=?", project.id);
    audit(actor.id, "project.approve", "audio_version", versionId, { projectId: project.id, versionNumber: v.version_number });
    for (const m of all("SELECT user_id FROM memberships WHERE studio_id=? AND role IN ('owner','manager') AND revoked_at IS NULL UNION SELECT user_id FROM project_members WHERE project_id=? AND role='engineer'", project.studio_id, project.id))
      notify(m.user_id, "project", `${v.label} approved ✓`, project.title, `/projects/${project.id}`);
  });
}

export function finalize(actorIn: Actor | null, projectId: string, versionId: string) {
  const { actor, role } = access(actorIn, projectId);
  if (!isTeam(role)) throw forbidden();
  return tx(() => {
    const v = one("SELECT * FROM audio_versions WHERE id=? AND project_id=?", versionId, projectId);
    if (!v) throw notFound("Version not found");
    if (!one("SELECT 1 FROM approvals WHERE version_id=?", versionId)) throw conflict("Only an approved version can be marked final");
    const extras = (JSON.parse(one("SELECT package_json FROM projects WHERE id=?", projectId)!.package_json) as string[]).filter((a) => {
      const k = one("SELECT kind FROM assets WHERE id=?", a)?.kind;
      return k === "deliverable";
    });
    run("UPDATE projects SET final_version_id=?, package_json=? WHERE id=?", versionId, JSON.stringify([v.asset_id, ...extras]), projectId);
    audit(actor.id, "project.finalize", "project", projectId, { versionId });
    for (const m of all("SELECT user_id FROM project_members WHERE project_id=? AND role='artist'", projectId))
      notify(m.user_id, "project", "Final delivery ready", "Settle any balance to unlock downloads", `/projects/${projectId}`);
  });
}

export function addDeliverable(actorIn: Actor | null, projectId: string, file: { name: string; type: string; data: Uint8Array }) {
  const { actor, project, role } = access(actorIn, projectId);
  if (!isTeam(role)) throw forbidden();
  const k = sniff(file.data);
  if (!k || !["wav", "mp3", "zip"].includes(k)) throw badRequest("Deliverables must be WAV, MP3 or ZIP");
  if (file.data.byteLength > MAX_ZIP_BYTES) throw badRequest("File too large");
  const obj = putObject({ ownerId: actor.id, kind: "deliverable", filename: file.name, mime: k === "zip" ? "application/zip" : k === "wav" ? "audio/wav" : "audio/mpeg", data: file.data });
  if (obj.scanStatus !== "clean") throw badRequest("File quarantined by security scan");
  const pkg = JSON.parse(project.package_json) as string[];
  run("UPDATE projects SET package_json=? WHERE id=?", JSON.stringify([...pkg, obj.id]), projectId);
  audit(actor.id, "project.deliverable", "project", projectId, { assetId: obj.id });
}

/** PR-04: unlock only when final + verified balance settled; short-lived signed URL; delivery event recorded. */
export function downloadDeliverable(actorIn: Actor | null, projectId: string, assetId: string) {
  const { actor, project, role } = access(actorIn, projectId);
  const pkg = JSON.parse(project.package_json) as string[];
  if (!pkg.includes(assetId)) throw notFound("File not in delivery package");
  if (role === "artist") {
    if (!project.final_version_id) throw forbidden("Delivery isn't finalized yet");
    if (project.paid_minor < project.price_minor) throw forbidden("Settle the project balance to unlock final files");
  }
  insert("delivery_events", { id: uuid(), project_id: projectId, user_id: actor.id, asset_id: assetId, created_at: now() });
  if (role === "artist") run("UPDATE projects SET status='delivered' WHERE id=? AND status='approved'", projectId);
  audit(actor.id, "asset.download", "asset", assetId, { projectId });
  return { url: signUrl(assetId, 120, "attachment"), expiresIn: 120 };
}

export function postMessage(actorIn: Actor | null, projectId: string, body: string) {
  const { actor, project } = access(actorIn, projectId);
  const text = z.string().trim().min(1).max(2000).parse(body);
  insert("project_messages", { id: uuid(), project_id: projectId, author_id: actor.id, body: text, created_at: now() });
  for (const m of all("SELECT user_id FROM project_members WHERE project_id=? AND user_id != ?", projectId, actor.id)) notify(m.user_id, "message", `Message in ${project.title}`, text.slice(0, 100), `/projects/${projectId}`);
}

export function setProjectStatus(actorIn: Actor | null, projectId: string, status: string) {
  const { actor, role } = access(actorIn, projectId);
  if (role !== "manager" && !hasRole(actor, "admin")) throw forbidden();
  const s = z.enum(["active", "archived"]).parse(status);
  run("UPDATE projects SET status=? WHERE id=?", s, projectId);
  audit(actor.id, `project.${s}`, "project", projectId);
}

/** PR-06: user export of their own project data. */
export function exportProject(actorIn: Actor | null, projectId: string) {
  const data = getProject(actorIn, projectId);
  audit(actorIn!.id, "project.export", "project", projectId);
  return { ...data, versions: data.versions.map((v) => ({ ...v, streamUrl: undefined })), exportedAt: now() };
}
