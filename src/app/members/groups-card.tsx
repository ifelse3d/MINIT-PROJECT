"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/modal";
import { Tri, useTriText } from "@/components/language-provider";
import {
  addManyToGroup,
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
  const [search, setSearch] = useState("");
  // #9 (launch feedback): pick MANY people from the roster in one popup.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerGroup, setPickerGroup] = useState("");
  // §1-10 (work order 69): the chip's × asks first — one dialog for the card.
  const [removal, setRemoval] = useState<{ group: string; name: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Everyone the popup can offer: the committee roster plus anyone already
  // in any group — a shortcut, never a limit (typing still works below).
  const candidates = useMemo(() => {
    const set = new Set<string>(committeeNames);
    for (const r of rows ?? []) set.add(r.name);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [committeeNames, rows]);

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

  // B-3: the search narrows to matching groups, or to matching PEOPLE within
  // a group (the group row stays, showing only the people who match).
  const needle = search.trim().toLowerCase();
  const shownGroups: [string, string[]][] = [...byGroup.entries()].flatMap(
    ([g, names]) => {
      if (needle === "") return [[g, names] as [string, string[]]];
      if (g.toLowerCase().includes(needle)) return [[g, names] as [string, string[]]];
      const matching = names.filter((n) => n.toLowerCase().includes(needle));
      return matching.length > 0 ? [[g, matching] as [string, string[]]] : [];
    },
  );

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

      {/* B-3 (work order 51): the FORM on top, the list below it. */}
      {canEdit && (
        <div className="flex flex-col gap-3 border-b border-border pb-4">
          {/* #9: the one-popup way — pick a group, tick many names, done. */}
          {candidates.length > 0 && (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                setPickerGroup(group);
                setPicked(new Set());
                setPickerOpen(true);
              }}
            >
              ☑️{" "}
              <Tri
                bm="Pilih ramai daripada senarai sekali gus"
                zh="从名单一次过选多人"
                en="Pick several from the roster at once"
              />
            </Button>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                <Tri bm="Nama kumpulan" zh="分组名字" en="Group name" />
              </span>
              <input
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                maxLength={60}
                // A placeholder, not a suggestion: it shows the SHAPE of an
                // answer without proposing a category. Whatever this society
                // calls its own groups is the right answer.
                placeholder={t(
                  "cth: Unit Belia, Kumpulan Wanita",
                  "例如：青年组、妇女组",
                  "e.g. Youth unit, Women's group",
                )}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
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

          {/* B-5 (work order 51): the old datalist LOOKED like a dropdown and
              showed nothing until you typed — the tester read it as broken.
              The existing groups are now visible, tappable chips: tap one and
              the box fills. A NEW group is still just typed. */}
          {groupNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                <Tri bm="Kumpulan sedia ada:" zh="已有的分组：" en="Existing groups:" />
              </span>
              {groupNames.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  aria-pressed={group === g}
                  className={
                    "min-h-9 rounded-xs border-2 px-3 text-base transition " +
                    (group === g
                      ? "border-[#a855f7] bg-[#a855f7]/10 font-medium"
                      : "border-[color:var(--v2-border)] hover:border-[#a855f7]/60")
                  }
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {failed && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm="Tidak berjaya disimpan. Ciri kumpulan ini memerlukan satu kemas kini pangkalan data yang belum dijalankan — semua yang lain di halaman ini masih berfungsi seperti biasa."
                zh="没有保存成功。分组这个功能需要一支还没有跑的资料库更新 —— 这一页其他东西都照常可以用。"
                en="Could not save. Groups need a database update that has not been run yet — everything else on this page still works as normal."
              />
            </p>
          )}
        </div>
      )}

      {groupNames.length === 0 ? (
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Belum ada kumpulan. Namakan satu di atas — kumpulan itu wujud sebaik sahaja ada orang pertama di dalamnya."
            zh="还没有分组。在上面取一个名字 —— 加进第一个人，那个分组就存在了。"
            en="No groups yet. Name one above — a group exists as soon as its first person is in it."
          />
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* B-3: search across groups and people once there is enough to
              lose somebody in. */}
          {(rows?.length ?? 0) > 8 && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                "Cari kumpulan atau nama…",
                "搜分组或名字…",
                "Search a group or a name…",
              )}
              className="w-full max-w-sm rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-3 py-2 text-base outline-none focus:border-[color:var(--v2-primary)]"
            />
          )}
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-base">
              <thead>
                <tr className="border-b border-border text-left text-sm text-muted-foreground">
                  <th className="px-2 py-2 font-medium">
                    <Tri bm="Kumpulan" zh="分组" en="Group" />
                  </th>
                  <th className="px-2 py-2 font-medium">
                    <Tri bm="Ahli" zh="成员" en="Members" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {shownGroups.map(([g, names]) => (
                  <tr key={g} className="border-b border-border/60 align-top last:border-0">
                    <td className="w-40 px-2 py-3 font-semibold">
                      {g}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        ({(byGroup.get(g) ?? []).length})
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <ul className="flex flex-wrap gap-2">
                        {names.map((n) => (
                          <li
                            key={`${g}-${n}`}
                            className="inline-flex items-center gap-1.5 rounded-xs border-2 border-[color:var(--v2-border)] px-3 py-1 text-base"
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
                                onClick={() => setRemoval({ group: g, name: n })}
                              >
                                <X aria-hidden className="size-4" strokeWidth={2.4} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shownGroups.length === 0 && (
            <p className="text-base text-muted-foreground">
              <Tri
                bm={`Tiada padanan untuk "${search}".`}
                zh={`找不到「${search}」。`}
                en={`No match for "${search}".`}
              />
            </p>
          )}
        </div>
      )}

      {/* §1-10: the chip's × confirms through the app's own dialog. */}
      <ConfirmDialog
        open={removal !== null}
        onClose={() => setRemoval(null)}
        onConfirm={() => {
          const r = removal;
          setRemoval(null);
          if (!r) return;
          void (async () => {
            const res = await removeFromGroup({ group: r.group, name: r.name });
            setFailed(!res.ok);
            if (res.ok) await refresh();
          })();
        }}
        body={
          removal && (
            <Tri
              bm={`Keluarkan ${removal.name} daripada kumpulan "${removal.group}"?`}
              zh={`确定把 ${removal.name} 从「${removal.group}」移除？`}
              en={`Remove ${removal.name} from the group "${removal.group}"?`}
            />
          )
        }
        confirmLabel={<Tri bm="Keluarkan" zh="移除" en="Remove" />}
        destructive
      />

      {/* #9: the multi-select popup. */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} labelledBy="group-picker-title">
        <div className="flex flex-col gap-4">
          <h2 id="group-picker-title" className="text-xl font-semibold">
            ☑️ <Tri bm="Pilih ahli untuk kumpulan" zh="选人加进分组" en="Pick people for a group" />
          </h2>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground">
              <Tri bm="Nama kumpulan" zh="分组名字" en="Group name" />
            </span>
            <input
              value={pickerGroup}
              onChange={(e) => setPickerGroup(e.target.value)}
              maxLength={60}
              placeholder={t(
                "cth: Unit Belia, Kumpulan Wanita",
                "例如：青年组、妇女组",
                "e.g. Youth unit, Women's group",
              )}
              className="rounded-md border border-input bg-background px-3 py-2 text-base"
            />
          </label>
          {/* B-5: the existing groups, visible and tappable — same fix as the
              main form; the invisible datalist read as a broken dropdown. */}
          {groupNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {groupNames.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPickerGroup(g)}
                  aria-pressed={pickerGroup === g}
                  className={
                    "min-h-9 rounded-xs border-2 px-3 text-base transition " +
                    (pickerGroup === g
                      ? "border-[#a855f7] bg-[#a855f7]/10 font-medium"
                      : "border-[color:var(--v2-border)] hover:border-[#a855f7]/60")
                  }
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              <Tri
                bm={`${picked.size} dipilih daripada ${candidates.length}`}
                zh={`已选 ${picked.size} / ${candidates.length} 人`}
                en={`${picked.size} of ${candidates.length} picked`}
              />
            </span>
            <button
              type="button"
              className="text-sm underline underline-offset-4"
              onClick={() =>
                setPicked((prev) =>
                  prev.size === candidates.length ? new Set() : new Set(candidates),
                )
              }
            >
              {picked.size === candidates.length ? (
                <Tri bm="Kosongkan semua" zh="全部取消" en="Clear all" />
              ) : (
                <Tri bm="Pilih semua" zh="全选" en="Select all" />
              )}
            </button>
          </div>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-sm border border-[color:var(--v2-border)] p-2">
            {candidates.map((n) => (
              <li key={n}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-base hover:bg-[color:var(--v2-card-nested)]">
                  <input
                    type="checkbox"
                    checked={picked.has(n)}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(n)) next.delete(n);
                        else next.add(n);
                        return next;
                      })
                    }
                    className="h-5 w-5 accent-[color:var(--v2-primary)]"
                  />
                  {n}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>
              <Tri bm="Batal" zh="取消" en="Cancel" />
            </Button>
            <Button
              disabled={busy || picked.size === 0 || pickerGroup.trim() === ""}
              onClick={async () => {
                setBusy(true);
                const res = await addManyToGroup({
                  group: pickerGroup,
                  names: [...picked],
                });
                setFailed(!res.ok);
                if (res.ok) {
                  setPickerOpen(false);
                  setGroup(pickerGroup.trim());
                  await refresh();
                }
                setBusy(false);
              }}
            >
              ＋{" "}
              <Tri
                bm={`Masukkan ${picked.size} orang`}
                zh={`把 ${picked.size} 人加进去`}
                en={`Add ${picked.size} people`}
              />
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
