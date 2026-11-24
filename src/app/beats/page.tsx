import type { Metadata } from "next";
import { facets, searchBeats } from "@/server/modules/catalog";
import { BeatExplorer } from "./BeatExplorer";

export const metadata: Metadata = { title: "Explore beats" };

export default async function BeatsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  let result;
  try {
    result = searchBeats(sp);
  } catch {
    result = searchBeats({});
  }
  return (
    <div className="page stack lg">
      <header className="fade-up">
        <div className="eyebrow">Marketplace</div>
        <h1 style={{ marginTop: 10 }}>Find your next sound</h1>
        <p className="text-2" style={{ marginTop: 8 }}>Explore independent African producers. Every preview is tagged; licenses unlock clean files instantly.</p>
      </header>
      <BeatExplorer result={result} facets={facets()} params={sp} />
    </div>
  );
}
