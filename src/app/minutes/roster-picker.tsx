"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { loadRosterNames, type RosterName } from "./roster-actions";
import { loadMemberGroups, type GroupMember } from "@/app/members/group-actions";

// ---------------------------------------------------------------------------
// TICK THE PEOPLE WHO CAME.
//
// J's UX list, item 3: 「选了之后出名单可以 tick」. A temple AGM has a hundred
// attendees and the committee list already has most of their names on it.
// Typing them again is the sort of thing somebody does once and then stops
// using the product.
//
// Names ALREADY on the attendance list are shown ticked and disabled rather
// than hidden. Hiding them raises the question the person actually has —
// "did I already add Encik Rahman?" — and answers it by making him vanish.
//
// 2026-08-23 — and the society's OWN groups, the other half of the same item:
// 「可单选可多选，社团自己建 category」. Filter by one group or several, and
// "tick everyone shown" turns a whole group into attendance in one tap. The
// groups are whatever this society named (see members/groups-card.tsx); there
// is no built-in list and none is implied.
// ---------------------------------------------------------------------------

export function RosterPicker({
  /** Names already on the attendance list, lowercased for comparison. */
  alreadyThere,
  onAdd,
}: {
  alreadyThere: Set<string>;
  onAdd: (names: string[]) => void;
}) {
  const t = useTriText();
  const [roster, setRoster] = useState<RosterName[] | null>(null);
  const [groups, setGroups] = useState<GroupMember[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /** Which of the society's groups are being shown. Empty = everybody. */
  const [filter, setFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadRosterNames(), loadMemberGroups()]).then(([names, gm]) => {
      if (cancelled) return;
      setRoster(names);
      setGroups(gm);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Everyone who can be ticked: the committee list PLUS anybody who is only in
  // a group. Most of a youth wing is not on the committee — that is exactly why
  // the groups live in their own table rather than in the filing.
  const people: RosterName[] = (() => {
    if (roster === null) return [];
    const seen = new Set(roster.map((r) => r.name.toLowerCase()));
    const extra: RosterName[] = [];
    for (const g of groups) {
      const key = g.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      extra.push({ name: g.name, position: "" });
    }
    return [...roster, ...extra];
  })();

  // No names anywhere, no picker. An empty picker looks broken, and the answer
  // to "why is this empty" lives on a different page entirely.
  if (roster === null || people.length === 0) return null;

  const groupNames = [...new Set(groups.map((g) => g.group))];
  /** Lowercased names in each selected group, for filtering. */
  const inFilter = new Set(
    groups.filter((g) => filter.has(g.group)).map((g) => g.name.toLowerCase()),
  );
  const shown =
    filter.size === 0 ? people : people.filter((p) => inFilter.has(p.name.toLowerCase()));
  const available = people.filter((r) => !alreadyThere.has(r.name.toLowerCase()));

  if (!open) {
    return (
      <Button variant="outline" size="lg" className="self-start" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden className="size-5" strokeWidth={2.2} />
        {/* "From the list" not "from the committee list": since 2026-08-23 it
            also offers people who are only in one of the society's own groups,
            and most of a youth wing is not on the committee. */}
        <Tri
          bm={`Tanda daripada senarai anda (${available.length})`}
          zh={`从你们的名单里勾（${available.length} 位）`}
          en={`Tick from your lists (${available.length})`}
        />
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-border)] bg-white/60 p-4 dark:bg-white/5">
      <p className="text-base font-medium">
        <Tri
          bm="Siapa antara mereka yang hadir?"
          zh="他们之中谁来了？"
          en="Which of them attended?"
        />
      </p>

      {/* Multi-select, because 「可单选可多选」 — a meeting is often the youth
          wing AND the committee, and making that two passes is the friction
          that stops people using it. Nothing selected means everybody, which is
          the state somebody who has never made a group should see. */}
      {groupNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Tapis mengikut kumpulan" zh="按分组筛选" en="Filter by group" />
          </span>
          {groupNames.map((g) => {
            const on = filter.has(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(g)) next.delete(g);
                    else next.add(g);
                    return next;
                  })
                }
                className={`min-h-9 rounded-xs border-2 px-3 text-base font-medium ${
                  on
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-[color:var(--v2-border)] hover:bg-accent"
                }`}
              >
                {g}
              </button>
            );
          })}
          {filter.size > 0 && (
            <button
              type="button"
              onClick={() => setFilter(new Set())}
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              <Tri bm="Tunjuk semua" zh="全部显示" en="Show everyone" />
            </button>
          )}
        </div>
      )}

      {/* One tap for a whole group — the reason the filter exists at all. */}
      {shown.some((r) => !alreadyThere.has(r.name.toLowerCase())) && (
        <Button
          variant="outline"
          size="lg"
          className="self-start"
          onClick={() =>
            setPicked((prev) => {
              const next = new Set(prev);
              for (const r of shown) {
                if (!alreadyThere.has(r.name.toLowerCase())) next.add(r.name);
              }
              return next;
            })
          }
        >
          <Tri
            bm="Tanda semua yang dipaparkan"
            zh="下面这些全部勾起来"
            en="Tick everyone shown"
          />
        </Button>
      )}

      <ul className="flex flex-col divide-y">
        {shown.map((r) => {
          const here = alreadyThere.has(r.name.toLowerCase());
          const checked = here || picked.has(r.name);
          return (
            <li key={`${r.name}-${r.position}`}>
              <label
                className={`flex min-h-11 items-center gap-3 py-2 text-base ${
                  here ? "text-muted-foreground" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  className="size-5"
                  checked={checked}
                  disabled={here}
                  onChange={(e) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.name);
                      else next.delete(r.name);
                      return next;
                    })
                  }
                />
                <span className="flex-1">{r.name}</span>
                {r.position && (
                  <span className="text-sm text-muted-foreground">{r.position}</span>
                )}
                {here && (
                  <span className="text-sm">
                    <Tri bm="sudah ada" zh="已经加了" en="already added" />
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          disabled={picked.size === 0}
          onClick={() => {
            onAdd([...picked]);
            setPicked(new Set());
            setOpen(false);
          }}
        >
          <Tri
            bm={`Tambah ${picked.size} orang`}
            zh={`加进 ${picked.size} 位`}
            en={`Add ${picked.size}`}
          />
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            setPicked(new Set());
            setOpen(false);
          }}
        >
          <Tri bm="Batal" zh="取消" en="Cancel" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {t(
            "Senarai ini datang daripada halaman Ahli — senarai AJK dan kumpulan anda sendiri. Sesiapa yang hadir tetapi tiada dalam kedua-duanya, tambah sendiri di bawah.",
            "这份名单来自「成员」那一页 —— 职位名单，加上你们自己的分组。两边都没有的人，请在下面自己加。",
            "This comes from the Members page — the committee list plus your own groups. Anybody in neither gets added by hand below.",
          )}
        </span>
      </div>
    </div>
  );
}
