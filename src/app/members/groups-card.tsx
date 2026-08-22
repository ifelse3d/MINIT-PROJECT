"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import {
  addToGroup,
  loadMemberGroups,
  removeFromGroup,
  type GroupMember,
} from "./group-actions";

// ---------------------------------------------------------------------------
// THE SOCIETY'S OWN GROUPS.
//
// J's UX list, item 3: 「社团自己建 category」.
//
// 🔴 THERE IS NO STARTER LIST, and that is the feature. J named 青年团 and
// 小天使 as EXAMPLES from his own temple and said so plainly (2026-08-23:
// 「這個青年/小天使是我自己的 example，不是每一個社團都有的」). A guild, a
// clan association and a temple divide themselves in completely different ways
// — and any list we thought up would push them into the nearest wrong box and
// then look official while doing it. So the society types its own names, and
// the only names that ever appear are the ones they typed.
//
// A group is created by NAMING it while adding the first person. There is no
// separate "create a group" step, because an empty group is a thing somebody
// has to remember to come back and finish — and they will not.
//
// 🔴 This is NOT the committee list. That one (above, on the same page) is the
// "Senarai Ahli Jawatankuasa" that goes to the Registry of Societies. These
// groups are the society's own business and live in their own table, so an
// internal grouping can never end up inside a statutory return.
// ---------------------------------------------------------------------------

export function GroupsCard({
  canEdit,
  /** Names already on the committee list — offered as a shortcut, not a limit. */
  committeeNames,
}: {
  canEdit: boolean;
  committeeNames: string[];
}) {
  const t = useTriText();
  const [rows, setRows] = useState<GroupMember[] | null>(null);
  const [group, setGroup] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function refresh() {
    setRows(await loadMemberGroups());
  }
  useEffect(() => {
    let cancelled = false;
    void loadMemberGroups().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const byGroup = new Map<string, string[]>();
  for (const r of rows ?? []) {
    byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r.name]);
  }
  const groupNames = [...byGroup.keys()];

  async function add() {
    if (group.trim() === "" || name.trim() === "") return;
    setBusy(true);
    const res = await addToGroup({ group, name });
    setFailed(!res.ok);
    if (res.ok) {
      // The group name stays, the person's name clears: adding five people to
      // 青年团 is the normal shape, and retyping the group each time is the
      // sort of friction that makes somebody stop after two.
      setName("");
      await refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Kumpulan yang anda namakan sendiri, ikut cara pertubuhan anda membahagikan ahlinya. Ini bukan senarai yang difailkan — ia untuk menanda kehadiran dengan cepat."
          zh="由你们自己取名的分组，照你们社团本来的分法。这不是要申报的名单，是为了开会时快速勾出席。"
          en="Groups you name yourself, however your society actually divides its members. This is not the filed list — it is for ticking attendance quickly."
        />
      </p>

      {groupNames.length === 0 ? (
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Belum ada kumpulan. Namakan satu di bawah — kumpulan itu wujud sebaik sahaja ada orang pertama di dalamnya."
            zh="还没有分组。在下面取一个名字 —— 加进第一个人，那个分组就存在了。"
            en="No groups yet. Name one below — a group exists as soon as its first person is in it."
          />
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groupNames.map((g) => (
            <div key={g}>
              <p className="text-base font-semibold">
                {g}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({(byGroup.get(g) ?? []).length})
                </span>
              </p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {(byGroup.get(g) ?? []).map((n) => (
                  <li
                    key={`${g}-${n}`}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-[color:var(--v2-border)] px-3 py-1 text-base"
                  >
                    {n}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={t(
                          `Keluarkan ${n} daripada ${g}`,
                          `把 ${n} 从 ${g} 移除`,
                          `Remove ${n} from ${g}`,
                        )}
                        className="text-muted-foreground hover:text-red-700"
                        onClick={async () => {
                          const res = await removeFromGroup({ group: g, name: n });
                          setFailed(!res.ok);
                          if (res.ok) await refresh();
                        }}
                      >
                        <X aria-hidden className="size-4" strokeWidth={2.4} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                <Tri bm="Nama kumpulan" zh="分组名字" en="Group name" />
              </span>
              {/* A datalist, not a select: the existing groups are one keystroke
                  away, and a brand-new group is still just typed. A select would
                  make "we have started a new group" the hardest thing to do. */}
              <input
                list="minit-group-names"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                maxLength={60}
                // A placeholder, not a suggestion: it shows the SHAPE of an
                // answer without proposing a category. Whatever this society
                // calls its own groups is the right answer.
                placeholder={t(
                  "nama kumpulan anda sendiri",
                  "你们自己的分组名字",
                  "your own group name",
                )}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <datalist id="minit-group-names">
                {groupNames.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>

            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                <Tri bm="Nama orang" zh="人的名字" en="Person's name" />
              </span>
              {/* The committee names are offered, not imposed: most people in a
                  youth group are not on the committee at all, which is exactly
                  why these groups do not live in the committee table. */}
              <input
                list="minit-committee-names"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <datalist id="minit-committee-names">
                {committeeNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>

            <Button
              size="lg"
              disabled={busy || group.trim() === "" || name.trim() === ""}
              onClick={() => void add()}
            >
              <Plus aria-hidden className="size-5" strokeWidth={2.4} />
              <Tri bm="Masukkan" zh="加进去" en="Add" />
            </Button>
          </div>

          {failed && (
            <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm="Tidak berjaya disimpan. Ciri kumpulan ini memerlukan satu kemas kini pangkalan data yang belum dijalankan — semua yang lain di halaman ini masih berfungsi seperti biasa."
                zh="没有保存成功。分组这个功能需要一支还没有跑的资料库更新 —— 这一页其他东西都照常可以用。"
                en="Could not save. Groups need a database update that has not been run yet — everything else on this page still works as normal."
              />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
