"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./icons";

export async function api<T = any>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data as any)?.error?.message ?? `Request failed (${res.status})`);
  return data as T;
}

export { money } from "@/lib/format";

type Toast = { id: number; text: string; tone: "ok" | "bad" | "info" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export function Modal({ open, onClose, title, children, width }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Portal to <body> so the dialog is never trapped by a blurred/transformed ancestor (which breaks position: fixed).
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><IconX /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Avatar({ name, hue = 168, size = 32 }: { name: string; hue?: number; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return <span className="avatar" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 80% 70%), hsl(${(hue + 50) % 360} 75% 55%))` }}>{initials}</span>;
}

const STATUS: Record<string, [string, string]> = {
  published: ["ok", "Published"], draft: ["warn", "Draft"], unpublished: ["neutral", "Unpublished"], archived: ["neutral", "Archived"],
  exclusive_sold: ["plum", "Exclusive sold"], taken_down: ["bad", "Taken down"],
  pending: ["warn", "Pending"], processing: ["info", "Processing"], paid: ["ok", "Paid"], failed: ["bad", "Failed"], expired: ["neutral", "Expired"],
  refunded: ["neutral", "Refunded"], partially_refunded: ["warn", "Part-refunded"], disputed: ["bad", "Disputed"],
  held: ["warn", "Held — awaiting deposit"], confirmed: ["ok", "Confirmed"], cancelled: ["neutral", "Cancelled"], completed: ["info", "Completed"],
  active: ["info", "Active"], in_review: ["warn", "In review"], approved: ["ok", "Approved"], delivered: ["plum", "Delivered"],
  open: ["warn", "Open"], actioned: ["bad", "Taken down"], dismissed: ["neutral", "Dismissed"], resolved_refund: ["ok", "Refunded"], resolved_no_action: ["neutral", "Closed"],
  requested: ["warn", "Requested"],
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const [tone, text] = STATUS[status] ?? ["neutral", status];
  return <span className={`badge ${tone}`}>{label ?? text}</span>;
}

export function useAsync() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(ok, "ok");
      return r;
    } catch (e: any) {
      toast(e.message ?? "Something went wrong", "bad");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} className={`tab ${value === i.value ? "on" : ""}`} onClick={() => onChange(i.value)}>{i.label}</button>
      ))}
    </div>
  );
}

/** Decode audio in the browser to compute waveform peaks before upload (works for MP3 too). */
export async function computePeaks(file: File, bars = 180): Promise<{ peaks: number[]; durationMs: number } | null> {
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const ch = buf.getChannelData(0);
    const step = Math.floor(ch.length / bars);
    const out: number[] = [];
    let max = 0;
    for (let i = 0; i < bars; i++) {
      let s = 0;
      for (let j = i * step; j < (i + 1) * step; j += 8) s += ch[j] * ch[j];
      const v = Math.sqrt(s / (step / 8));
      out.push(v);
      max = Math.max(max, v);
    }
    void ctx.close();
    return { peaks: out.map((v) => Math.round((v / (max || 1)) * 100) / 100), durationMs: Math.round(buf.duration * 1000) };
  } catch {
    return null;
  }
}

/** Upload with progress (XHR gives upload progress events; fetch does not). */
export function uploadWithProgress(url: string, form: FormData, onProgress: (p: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error?.message ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}
