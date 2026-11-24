"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BeatCard, BeatRow, type BeatLite } from "@/components/beats";
import { IconGrid, IconSliders, IconWave } from "@/components/icons";

interface Result { items: BeatLite[]; page: number; pages: number; total: number }
interface Facets { genres: { genre: string; n: number }[]; moods: string[]; keys: string[] }

export function BeatExplorer({ result, facets, params }: { result: Result; facets: Facets; params: Record<string, string> }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [view, setView] = useState<"list" | "grid">("list");
  const [showMore, setShowMore] = useState(Boolean(params.bpmMin || params.bpmMax || params.key || params.mood || params.priceMax));
  const [q, setQ] = useState(params.q ?? "");

  // Filters live in the URL so any search is shareable (spec §06).
  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!("page" in patch)) next.delete("page");
    start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
  };
  useEffect(() => {
    if ((params.q ?? "") === q) return;
    const t = setTimeout(() => update({ q: q || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => setQ(params.q ?? ""), [params.q]);

  return (
    <div className="stack lg">
      <div className="card flat stack" style={{ gap: 14 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <input className="input grow" style={{ maxWidth: 380, borderRadius: 999 }} placeholder="Search title, producer, mood…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search beats" />
          <select className="select" style={{ width: 170 }} value={params.sort ?? "newest"} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="popular">Most popular</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
          <button className={`chip ${showMore ? "on" : ""}`} onClick={() => setShowMore(!showMore)}><IconSliders width={15} />BPM / Key</button>
          <div className="grow" />
          <div className="tabs" role="group" aria-label="View">
            <button className={`tab ${view === "list" ? "on" : ""}`} onClick={() => setView("list")} aria-label="List view"><IconWave width={16} /></button>
            <button className={`tab ${view === "grid" ? "on" : ""}`} onClick={() => setView("grid")} aria-label="Grid view"><IconGrid width={16} /></button>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className={`chip ${!params.genre ? "on" : ""}`} onClick={() => update({ genre: undefined })}>All genres</button>
          {facets.genres.map((g) => (
            <button key={g.genre} className={`chip ${params.genre === g.genre ? "on" : ""}`} onClick={() => update({ genre: params.genre === g.genre ? undefined : g.genre })}>
              {g.genre} <span className="muted xs">{g.n}</span>
            </button>
          ))}
        </div>
        {showMore && (
          <div className="field-row fade-up">
            <label className="label">BPM from<input className="input" type="number" min={40} max={220} defaultValue={params.bpmMin} onBlur={(e) => update({ bpmMin: e.target.value || undefined })} /></label>
            <label className="label">BPM to<input className="input" type="number" min={40} max={220} defaultValue={params.bpmMax} onBlur={(e) => update({ bpmMax: e.target.value || undefined })} /></label>
            <label className="label">Key
              <select className="select" value={params.key ?? ""} onChange={(e) => update({ key: e.target.value || undefined })}>
                <option value="">Any key</option>
                {facets.keys.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label className="label">Mood
              <select className="select" value={params.mood ?? ""} onChange={(e) => update({ mood: e.target.value || undefined })}>
                <option value="">Any mood</option>
                {facets.moods.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label className="label">Max price (GHS)<input className="input" type="number" min={0} defaultValue={params.priceMax} onBlur={(e) => update({ priceMax: e.target.value || undefined })} /></label>
          </div>
        )}
      </div>

      <div className="row between">
        <span className="muted small">{pending ? "Searching…" : `${result.total} beat${result.total === 1 ? "" : "s"}`}</span>
        {Object.keys(params).some((k) => k !== "sort" && k !== "page") && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(""); start(() => router.replace(path)); }}>Clear filters</button>}
      </div>

      <div style={{ opacity: pending ? 0.5 : 1, transition: "opacity .2s" }}>
        {result.items.length === 0 ? (
          <div className="empty">No beats match those filters yet. Try another genre or widen the BPM range.</div>
        ) : view === "list" ? (
          <div className="stack" style={{ gap: 4 }}>
            {result.items.map((b, i) => <BeatRow key={b.id} beat={b} queue={result.items} index={(result.page - 1) * 12 + i} />)}
          </div>
        ) : (
          <div className="grid cols-4">{result.items.map((b, i) => <BeatCard key={b.id} beat={b} queue={result.items} index={i} />)}</div>
        )}
      </div>

      {result.pages > 1 && (
        <nav className="row" style={{ justifyContent: "center" }} aria-label="Pagination">
          <button className="btn btn-sm" disabled={result.page <= 1} onClick={() => update({ page: String(result.page - 1) })}>Previous</button>
          <span className="muted small">Page {result.page} of {result.pages}</span>
          <button className="btn btn-sm" disabled={result.page >= result.pages} onClick={() => update({ page: String(result.page + 1) })}>Next</button>
        </nav>
      )}
    </div>
  );
}
