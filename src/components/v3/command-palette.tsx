"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalTarget } from "@/lib/portal-target";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Tri, useTriText } from "@/components/language-provider";
import { NAV_ITEMS, SETTINGS_NAV, type NavItem } from "@/components/nav-items";
import { cn } from "./surfaces";

// ---------------------------------------------------------------------------
// Command palette (violet redesign §5.5, minimal by design): the place the
// collapsed search icon goes. PAGES are fuzzy-matched client-side from the
// same nav source everything else uses; record search stays on /search —
// the palette's last row hands the query over. "Do not add new search
// backends" — and none were.
// ---------------------------------------------------------------------------

function pageMatches(q: string): NavItem[] {
  const items = [...NAV_ITEMS, ...SETTINGS_NAV.filter((s) => !NAV_ITEMS.includes(s))];
  const ql = q.trim().toLowerCase();
  if (!ql) return items.slice(0, 7);
  return items
    .filter((i) =>
      [i.bm, i.zh, i.en, i.href].some((s) => s.toLowerCase().includes(ql)),
    )
    .slice(0, 7);
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTriText();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const pages = useMemo(() => pageMatches(q), [q]);
  // The rows: pages first, then the one "search the records" row.
  const rowCount = pages.length + (q.trim() ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    // One deferred tick: reset + focus after the overlay paints (and the
    // eslint baseline forbids sync setState in an effect).
    const id = setTimeout(() => {
      setQ("");
      setCursor(0);
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (index: number) => {
    if (index < pages.length) {
      router.push(pages[index].href);
    } else if (q.trim()) {
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
    onClose();
  };

  // Portalled OUT of the glass top bar (its backdrop-filter is the containing
  // block for fixed descendants — work order 46 §0-1) but INTO .v2-root,
  // never <body>: the --v2-* tokens live on .v2-root, and from <body> the
  // card loses them all (work order 51 C-1). See src/lib/portal-target.ts.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(21,18,31,0.45)] p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Carian pantas", "快速搜索", "Quick search")}
        className="w-full max-w-[560px] overflow-hidden rounded-lg border border-[color:var(--v2-border)] bg-[color:var(--v2-card-raised)] shadow-[var(--v2-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--v2-border)] px-4">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--v2-text-soft)]" strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(rowCount - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(cursor);
              }
            }}
            placeholder={t(
              "Taip untuk cari minit, resit, halaman…",
              "输入以搜索记录、收据、页面……",
              "Type to search minutes, receipts, pages…",
            )}
            className="h-12 w-full bg-transparent text-base outline-none"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {pages.length > 0 && (
            <li className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--v2-text-soft)]">
              <Tri bm="Halaman" zh="页面" en="Pages" />
            </li>
          )}
          {pages.map((p, i) => {
            const Icon = p.icon;
            return (
              <li key={p.href}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  onMouseEnter={() => setCursor(i)}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-3 rounded-sm px-3 text-base",
                    cursor === i ? "bg-[color:var(--v2-primary-soft)]" : "",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[color:var(--v2-text-soft)]" strokeWidth={1.8} />
                  <Tri bm={p.bm} zh={p.zh} en={p.en} />
                </button>
              </li>
            );
          })}
          {q.trim() ? (
            <li>
              <button
                type="button"
                onClick={() => go(pages.length)}
                onMouseEnter={() => setCursor(pages.length)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-3 rounded-sm px-3 text-base",
                  cursor === pages.length ? "bg-[color:var(--v2-primary-soft)]" : "",
                )}
              >
                <Search className="h-4 w-4 shrink-0 text-[color:var(--v2-text-soft)]" strokeWidth={1.8} />
                <Tri
                  bm={`Cari “${q.trim()}” dalam rekod`}
                  zh={`在记录里搜索「${q.trim()}」`}
                  en={`Search the records for “${q.trim()}”`}
                />
                {" →"}
              </button>
            </li>
          ) : (
            pages.length === 0 && (
              <li className="px-3 py-4 text-base text-[color:var(--v2-text-soft)]">
                <Tri bm="Tiada padanan." zh="没有匹配的页面。" en="Nothing matches." />
              </li>
            )
          )}
        </ul>
      </div>
    </div>,
    portalTarget(),
  );
}
