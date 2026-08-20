"use client";

// 2026-07-28 — the org list used to be rendered straight into the server page.
// Two problems for the pilot temple network (20+ halls): you had to scroll past
// every hall to reach the "create" form (now its own page, /orgs/new), and there
// was no way to FIND a hall. This client component owns the list plus a search
// box. The box only appears once there are enough orgs to be worth searching —
// a search field above two cards is just noise.
//
// 2026-07-29 — RESTRUCTURED after the pilot user could not read this page.
// Three complaints, three fixes:
//
//  1. "Why are there so many HQs? Shouldn't there be one?"  The list was FLAT,
//     so a branch card sat beside its own HQ card looking like a peer, and the
//     word "HQ" reads as a unique title rather than "top of a tree". Branches
//     are now NESTED under their HQ, and the HQ line says how many branches it
//     has, so a tree reads as one thing rather than three unrelated cards.
//  2. The DEMO orgs were more than half the list. They now live in a collapsed
//     "sample data" section below the real ones.
//  3. The role said "can do everything" (see ROLE_LABEL, status-labels.ts).
//
// NOTE for whoever picks this up: J has asked for "one account = one org,
// either HQ or branch" and for the AI quota to be SHARED across a whole tree.
// Both need database changes and are written up separately — this file still
// shows the world as the database actually is today (per-org quota, an account
// may hold several trees). Do not make this file *claim* the new model before
// the database enforces it.

import { useMemo, useState } from "react";
import { ChevronRight, CornerDownRight, Search, X } from "lucide-react";
import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri, useTriText } from "@/components/language-provider";
import { setActiveOrg } from "./actions";
import { CreditForm } from "./credit-form";

/** Everything the list needs, pre-flattened by the server page (serialisable). */
export type OrgListItem = {
  id: number;
  name: string;
  parentId: number | null;
  parentName: string | null;
  isDemo: boolean;
  isActive: boolean;
  /** Direct role on this org, if any (already an enum key, not a label). */
  role: string | null;
  isAdmin: boolean;
  extraCredits: number;
  monthlyFreeQuota: number;
  usedThisMonth: number;
};

type Tree = { root: OrgListItem; branches: OrgListItem[] };

/**
 * Show the search box only when the list is long enough to need it.
 * 2026-07-28 — was 6, which hid the box for anyone with a couple of orgs and
 * made it look like search did not exist.
 * 2026-07-29 — counted in TREES, not orgs: a HQ with one branch is two rows but
 * only one thing to look for, and a search box above it is noise again.
 */
const SEARCH_THRESHOLD = 3;

/**
 * Group a flat list into HQ → branches.
 * An org whose parent is not in the list is treated as a root: RLS can hand us
 * a branch without its HQ (you were added to the branch only), and dropping it
 * would make an org the user really has silently disappear.
 */
function buildTrees(orgs: OrgListItem[]): Tree[] {
  const present = new Set(orgs.map((o) => o.id));
  const roots = orgs.filter((o) => o.parentId === null || !present.has(o.parentId));
  const byParent = new Map<number, OrgListItem[]>();
  for (const o of orgs) {
    if (o.parentId === null || !present.has(o.parentId)) continue;
    const list = byParent.get(o.parentId) ?? [];
    list.push(o);
    byParent.set(o.parentId, list);
  }
  return roots.map((root) => ({
    root,
    branches: (byParent.get(root.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }));
}

export function OrgList({ orgs }: { orgs: OrgListItem[] }) {
  const t = useTriText();
  const [query, setQuery] = useState("");
  const [showDemo, setShowDemo] = useState(false);

  const needle = query.trim().toLowerCase();

  const { realTrees, demoTrees, matchedCount, totalCount } = useMemo(() => {
    const all = buildTrees(orgs);
    // A tree survives the filter if the HQ or ANY branch matches — hiding the
    // HQ of a matching branch would put the branch back in a flat list.
    const hit = (o: OrgListItem) =>
      o.name.toLowerCase().includes(needle) ||
      (o.parentName ?? "").toLowerCase().includes(needle);
    const kept = needle
      ? all.filter((tr) => hit(tr.root) || tr.branches.some(hit))
      : all;
    return {
      realTrees: kept.filter((tr) => !tr.root.isDemo),
      demoTrees: kept.filter((tr) => tr.root.isDemo),
      matchedCount: kept.length,
      totalCount: all.length,
    };
  }, [orgs, needle]);

  const showSearch = totalCount >= SEARCH_THRESHOLD;
  const nothingFound = needle !== "" && matchedCount === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Same frosted pill as the shell's top search bar (v2/top-search.tsx):
          one search shape everywhere, so people recognise it. Label is the
          placeholder, not a heading — the icon already says "search". */}
      {showSearch && (
        <div className="mb-1">
          <div className="v2-glass flex items-center gap-3 rounded-full px-5 py-3">
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-text-soft)]"
            >
              <Search className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t(
                "Cari pertubuhan",
                "搜索组织",
                "Search organisations",
              )}
              placeholder={t(
                "Cari pertubuhan…",
                "搜索组织…",
                "Search organisations…",
              )}
              className="w-full bg-transparent text-base text-[color:var(--v2-text)] placeholder:text-[color:var(--v2-text-soft)] focus:outline-none"
            />
            {query !== "" && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("Kosongkan", "清除", "Clear")}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-text-soft)] hover:bg-white/60"
              >
                <X className="h-5 w-5" strokeWidth={1.9} />
              </button>
            )}
          </div>
          {needle !== "" && (
            <p className="mt-2 px-5 text-sm text-[color:var(--v2-text-soft)] tabular-nums">
              {matchedCount} / {totalCount}
            </p>
          )}
        </div>
      )}

      {nothingFound && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Tri
                bm="Tiada pertubuhan sepadan"
                zh="没有符合的组织"
                en="No organisation matches that"
              />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Cuba sebahagian nama sahaja."
                zh="试试只输入名称的一部分。"
                en="Try just part of the name."
              />
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {realTrees.map((tree) => (
        <TreeCard key={tree.root.id} tree={tree} />
      ))}

      {/* Sample data, collapsed. It is useful for a first look and pure clutter
          afterwards, so it stays one line until asked for. */}
      {demoTrees.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowDemo((v) => !v)}
            aria-expanded={showDemo}
            className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm text-muted-foreground hover:bg-white/50 dark:hover:bg-white/5"
          >
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${showDemo ? "rotate-90" : ""}`}
              strokeWidth={2}
            />
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">
              DEMO
            </Badge>
            <span>
              <Tri
                bm="Data contoh — untuk mencuba sahaja, bukan rekod sebenar"
                zh="示范资料 —— 只是给您试用的，不是真实记录"
                en="Sample data — for trying things out, not real records"
              />
            </span>
            <span className="ml-auto tabular-nums">{demoTrees.length}</span>
          </button>
          {showDemo && (
            <div className="mt-2 flex flex-col gap-3">
              {demoTrees.map((tree) => (
                <TreeCard key={tree.root.id} tree={tree} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One HQ and everything under it, as a single card. */
function TreeCard({ tree }: { tree: Tree }) {
  const { root, branches } = tree;
  // Highlight the whole tree when the active org is anywhere inside it, so
  // the ring answers "which group am I working in", not just "which row".
  const treeIsActive = root.isActive || branches.some((b) => b.isActive);

  return (
    <Card className={treeIsActive ? "ring-2 ring-[#7c6cf5]/70" : ""}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {root.name}
              {root.isDemo && (
                <Badge className="ml-2 bg-amber-500 text-white hover:bg-amber-500">
                  DEMO
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {/* "Induk / HQ / 总部" alone reads as a unique title, which is why
                  several of them looked like a bug. Say what it means. */}
              {branches.length > 0 ? (
                <>
                  <Tri bm="Induk" zh="总部" en="Head office" />
                  {" · "}
                  <span className="tabular-nums">{branches.length}</span>{" "}
                  <Tri bm="cawangan" zh="个分会" en="branches" />
                </>
              ) : (
                <Tri
                  bm="Pertubuhan (tiada cawangan)"
                  zh="机构（没有分会）"
                  en="Organisation (no branches)"
                />
              )}
              {root.role ? (
                <>
                  {" · "}
                  <Tri {...labelFor(ROLE_LABEL, root.role)} />
                </>
              ) : null}
            </CardDescription>
          </div>
          <ActiveControl org={root} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {root.isAdmin && (
          <CreditForm
            extraCredits={root.extraCredits}
            monthlyFreeQuota={root.monthlyFreeQuota}
            usedThisMonth={root.usedThisMonth}
          />
        )}

        {branches.length > 0 && (
          <ul className="flex flex-col gap-2 border-t pt-3">
            {branches.map((b) => (
              <li
                key={b.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2 text-sm ${
                  b.isActive ? "bg-[#7c6cf5]/10" : ""
                }`}
              >
                <CornerDownRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.8}
                />
                <span className="font-medium">{b.name}</span>
                {b.role ? (
                  <span className="text-muted-foreground">
                    <Tri {...labelFor(ROLE_LABEL, b.role)} />
                  </span>
                ) : null}
                {b.isAdmin && (
                  <span className="w-full pl-7 sm:w-auto sm:pl-0">
                    <CreditForm
                      extraCredits={b.extraCredits}
                      monthlyFreeQuota={b.monthlyFreeQuota}
                      usedThisMonth={b.usedThisMonth}
                    />
                  </span>
                )}
                <span className="ml-auto">
                  <ActiveControl org={b} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** "Active" badge, or the button that switches to this org. */
function ActiveControl({ org }: { org: OrgListItem }) {
  if (org.isActive) {
    return (
      <Badge className="bg-green-600 text-white hover:bg-green-600">
        <Tri bm="Sedang guna" zh="正在用" en="In use" />
      </Badge>
    );
  }
  return (
    <form action={setActiveOrg}>
      <input type="hidden" name="orgId" value={org.id} />
      <Button type="submit" variant="outline" size="sm">
        <Tri bm="Tukar ke sini" zh="切换到这里" en="Switch to this" />
      </Button>
    </form>
  );
}
