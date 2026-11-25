"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Copies each table's column headings onto its cells (data-label) so that, on phones,
 * CSS can render every row as a labelled card instead of a sideways-scrolling table.
 */
export function ResponsiveTables() {
  const path = usePathname();
  useEffect(() => {
    const label = () => {
      for (const table of document.querySelectorAll<HTMLTableElement>("table.table")) {
        const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
        if (!heads.length) continue;
        for (const row of table.querySelectorAll("tbody tr")) {
          [...row.children].forEach((td, i) => {
            const l = heads[i] ?? "";
            if (td.getAttribute("data-label") !== l) td.setAttribute("data-label", l);
          });
        }
      }
    };
    label();
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; label(); });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [path]);
  return null;
}
