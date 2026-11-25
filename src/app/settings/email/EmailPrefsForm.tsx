"use client";
import { useState } from "react";
import { api, useToast } from "@/components/ui";

type Prefs = Record<string, boolean> & { all: boolean };
type Cat = { id: string; label: string; description: string };

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}

export function EmailPrefsForm({ initial, categories, token }: { initial: Prefs; categories: Cat[]; token?: string }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saving, setSaving] = useState(false);
  const save = async (patch: Partial<Prefs>) => {
    const prev = prefs;
    setPrefs({ ...prefs, ...patch } as Prefs);
    setSaving(true);
    try {
      const r = await api<{ prefs: Prefs }>(`/api/v1/me/email-prefs${token ? `?token=${encodeURIComponent(token)}` : ""}`, { method: "PUT", json: patch });
      setPrefs(r.prefs);
      toast("Email preferences saved", "ok");
    } catch (e: any) {
      setPrefs(prev);
      toast(e.message, "bad");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="stack lg" style={{ marginTop: 26 }}>
      <div className="card pref-row pref-master">
        <div className="grow">
          <b>Notification emails</b>
          <div className="muted small">{prefs.all ? "On — we email you about the things switched on below." : "Off — you won't get notification emails. In-app notifications continue."}</div>
        </div>
        <Toggle on={prefs.all} disabled={saving} onChange={(v) => save({ all: v })} label="All notification emails" />
      </div>
      <div className="card stack" style={{ gap: 0, padding: 6, opacity: prefs.all ? 1 : 0.5 }}>
        {categories.map((c, i) => (
          <div key={c.id} className="pref-row" style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>
            <div className="grow">
              <b>{c.label}</b>
              <div className="muted small">{c.description}</div>
            </div>
            <Toggle on={prefs.all && prefs[c.id]} disabled={saving || !prefs.all} onChange={(v) => save({ [c.id]: v })} label={c.label} />
          </div>
        ))}
      </div>
      <p className="muted small">
        Always sent, whatever you choose here: email confirmation links, studio invites, disputes, and notices about your content or account.
      </p>
    </div>
  );
}
