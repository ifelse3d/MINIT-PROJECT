"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { loadRosterNames, type RosterName } from "./roster-actions";
import { loadMemberGroups, type GroupMember } from "@/app/members/group-actions";
import { attendeeIdentityKey } from "@/lib/attendee-identity";

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
  /** attendeeIdentityKey()s already on the attendance list. I4 (work order
   *  81): keys, not bare names — 「Ali (青年組)」 and 「Ali (婦女組)」 are two
   *  rows and each must tick (and grey out) on its own. */
  alreadyThere,
  onAdd,
}: {
  alreadyThere: Set<string>;
  onAdd: (people: { name: string; note: string | null }[]) => void;
}) {
  const t = useTriText();
  const [roster, setRoster] = useState<RosterName[] | null>(null);
  const [groups, setGroups] = useState<GroupMember[]>([]);
  const [open, setOpen] = useState(false);
  /** attendeeIdentityKey()s ticked in this open picker. */
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
  const available = people.filter(
    (r) => !alreadyThere.has(attendeeIdentityKey(r.name, r.note)),
  );

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

      {/* C-9 (work order 51): a DROPDOWN, one group at a time. The chip row
          was read as buttons that "did nothing" (and its selected state was
          the last black button in the app, #10). "Everyone" is the first
          option, which is also the state somebody with no groups sees. */}
      {groupNames.length > 0 && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            <Tri bm="Tapis mengikut kumpulan" zh="按分组筛选" en="Filter by group" />
          </span>
          <select
            value={filter.size === 1 ? [...filter][0] : ""}
            onChange={(e) =>
              setFilter(e.target.value === "" ? new Set() : new Set([e.target.value]))
            }
            className="w-full min-w-0 rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base sm:w-auto"
          >
            <option value="">
              {t("Semua orang", "全部的人", "Everyone")}
            </option>
            {groupNames.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* One tap for a whole group — the reason the filter exists at all. */}
      {shown.some((r) => !alreadyThere.has(attendeeIdentityKey(r.name, r.note))) && (
        <Button
          variant="outline"
          size="lg"
          className="self-start"
          onClick={() =>
            setPicked((prev) => {
              const next = new Set(prev);
              for (const r of shown) {
                const key = attendeeIdentityKey(r.name, r.note);
                if (!alreadyThere.has(key)) next.add(key);
              }
              return next;
            })
          }
        >
          {/* C-9: "Select all" — the old sentence read as an instruction. */}
          <Tri bm="Pilih semua" zh="全选" en="Select all" />
        </Button>
      )}

      <ul className="flex flex-col divide-y">
        {shown.map((r) => {
          // I4: the row's identity is name+note (B-6) — ticking 「Ali (青年組)」
          // must not tick, or grey out, 「Ali (婦女組)」.
          const key = attendeeIdentityKey(r.name, r.note);
          const here = alreadyThere.has(key);
          const checked = here || picked.has(key);
          return (
            <li key={`${r.name}-${r.position}-${r.note ?? ""}`}>
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
                      if (e.target.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                />
                <span className="flex-1">
                  {r.name}
                  {/* B-6 (work order 51): the tell-apart note rides with the
                      name wherever the name is shown — two 陈小明 must be
                      tickable apart. */}
                  {(r.note ?? "") !== "" && (
                    <span className="ml-1.5 text-sm text-muted-foreground">
                      {r.note}
                    </span>
                  )}
                </span>
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
            // Keys back to people: the person object carries the note along,
            // so the attendance row records WHICH Ali was ticked.
            onAdd(
              people
                .filter((r) => picked.has(attendeeIdentityKey(r.name, r.note)))
                .map((r) => ({ name: r.name, note: r.note ?? null })),
            );
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
