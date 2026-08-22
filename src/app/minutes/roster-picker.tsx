"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { loadRosterNames, type RosterName } from "./roster-actions";

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
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void loadRosterNames().then((names) => {
      if (!cancelled) setRoster(names);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // No roster, no picker. An empty picker looks broken, and the answer to
  // "why is this empty" lives on a different page entirely.
  if (roster === null || roster.length === 0) return null;

  const available = roster.filter((r) => !alreadyThere.has(r.name.toLowerCase()));

  if (!open) {
    return (
      <Button variant="outline" size="lg" className="self-start" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden className="size-5" strokeWidth={2.2} />
        <Tri
          bm={`Tanda daripada senarai AJK (${available.length})`}
          zh={`从职位名单里勾（${available.length} 位）`}
          en={`Tick from the committee list (${available.length})`}
        />
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-[color:var(--v2-border)] bg-white/60 p-4 dark:bg-white/5">
      <p className="text-base font-medium">
        <Tri
          bm="Siapa antara mereka yang hadir?"
          zh="他们之中谁来了？"
          en="Which of them attended?"
        />
      </p>
      <ul className="flex flex-col divide-y">
        {roster.map((r) => {
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
            "Senarai ini datang daripada halaman Ahli. Orang yang hadir tetapi bukan AJK, tambah sendiri di bawah.",
            "这份名单来自「成员」那一页。来了但不是委员的人，请在下面自己加。",
            "This list comes from the Members page. Somebody who attended but is not on the committee gets added by hand below.",
          )}
        </span>
      </div>
    </div>
  );
}
