"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { Tri, useTriText } from "@/components/language-provider";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";
import {
  deleteOrgTemplate,
  loadOrgTemplates,
  saveOrgTemplate,
  type TemplateKind,
} from "./template-actions";

// ---------------------------------------------------------------------------
// TEMPLATE CHIPS (launch feedback #5): the organisation's own wordings, one
// tap to use, a popup to manage. Device-local copy first (instant, works
// offline), the organisation's table (migration 28) as the durable copy —
// union-merged on load, same discipline as the register.
// ---------------------------------------------------------------------------

function isStringArray(parsed: unknown): boolean {
  return Array.isArray(parsed) && parsed.every((x) => typeof x === "string");
}

export function useTemplates(kind: TemplateKind) {
  const key = useScopedKey(`money:templates:${kind}:v1`);
  const [labels, setLabels] = usePersistentState<string[]>(key, [], isStringArray);
  const [dbBehind, setDbBehind] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadOrgTemplates(kind).then((remote) => {
      if (cancelled || remote.length === 0) return;
      setLabels((local) => {
        const seen = new Set(local);
        return [...local, ...remote.filter((r) => !seen.has(r))];
      });
    });
    return () => {
      cancelled = true;
    };
    // setLabels is stable (usePersistentState); run once per kind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  function add(label: string) {
    const trimmed = label.trim().slice(0, 120);
    if (trimmed === "") return;
    setLabels((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    void saveOrgTemplate(kind, trimmed).then((r) => {
      if (!r.ok && r.reason === "db_behind") setDbBehind(true);
    });
  }

  function remove(label: string) {
    setLabels((prev) => prev.filter((x) => x !== label));
    void deleteOrgTemplate(kind, label);
  }

  return { labels, add, remove, dbBehind };
}

export function TemplateChips({
  kind,
  onPick,
  /** The field's current value — offered as "save this as a template". */
  currentValue,
}: {
  kind: TemplateKind;
  onPick: (label: string) => void;
  currentValue?: string;
}) {
  const t = useTriText();
  const { labels, add, remove, dbBehind } = useTemplates(kind);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const current = (currentValue ?? "").trim();
  const canSaveCurrent = current !== "" && !labels.includes(current);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.slice(0, 8).map((label) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(label)}
          className="rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card-nested)] px-2.5 py-1 text-sm hover:border-[color:var(--v2-primary)] hover:text-[color:var(--v2-primary)]"
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-[color:var(--v2-border-strong)] px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground"
      >
        🏷{" "}
        {labels.length > 0 ? (
          <Tri bm="Templat…" zh="模板…" en="Templates…" />
        ) : (
          <Tri bm="Buat templat perkataan" zh="做用词模板" en="Make wording templates" />
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={`tpl-${kind}-title`}>
        <div className="flex flex-col gap-4">
          <h2 id={`tpl-${kind}-title`} className="text-xl font-semibold">
            🏷{" "}
            {kind === "income_purpose" ? (
              <Tri bm="Templat tujuan pendapatan" zh="收入用途的模板" en="Income purpose templates" />
            ) : (
              <Tri bm="Templat perihal perbelanjaan" zh="开支说明的模板" en="Expense description templates" />
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Setiap pertubuhan ada perkataannya sendiri. Simpan di sini sekali — lepas itu satu ketukan sahaja."
              zh="每个社团有自己的叫法。在这里存一次 —— 之后点一下就填好。"
              en="Every society has its own wording. Save it here once — after that it is one tap."
            />
          </p>

          {labels.length === 0 ? (
            <p className="rounded-md border-2 border-dashed p-3 text-base text-muted-foreground">
              <Tri
                bm="Belum ada templat. Tambah satu di bawah."
                zh="还没有模板。在下面加一个。"
                en="No templates yet. Add one below."
              />
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {labels.map((label) => (
                <li
                  key={label}
                  className="flex items-center justify-between gap-2 rounded-sm border border-[color:var(--v2-border)] px-3 py-2"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-base hover:text-[color:var(--v2-primary)]"
                    onClick={() => {
                      onPick(label);
                      setOpen(false);
                    }}
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(label)}
                    aria-label={t(`Padam ${label}`, `删除 ${label}`, `Remove ${label}`)}
                    className="text-sm text-muted-foreground underline underline-offset-4 hover:text-red-700"
                  >
                    <Tri bm="Padam" zh="删除" en="Remove" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-48 flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                <Tri bm="Templat baharu" zh="新模板" en="New template" />
              </span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={120}
                placeholder={
                  kind === "income_purpose"
                    ? t("cth: Derma bangunan", "例：香油钱", "e.g. Building fund")
                    : t("cth: Cat dewan", "例：礼堂维修", "e.g. Hall repairs")
                }
                className="rounded-md border border-input bg-background px-3 py-2 text-base"
              />
            </label>
            <Button
              disabled={draft.trim() === ""}
              onClick={() => {
                add(draft);
                setDraft("");
              }}
            >
              ＋ <Tri bm="Simpan" zh="存起来" en="Save" />
            </Button>
          </div>

          {canSaveCurrent && (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => add(current)}
            >
              💾{" "}
              <Tri
                bm={`Simpan “${current}” sebagai templat`}
                zh={`把「${current}」存为模板`}
                en={`Save “${current}” as a template`}
              />
            </Button>
          )}

          {dbBehind && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm="Templat disimpan pada peranti ini sahaja buat masa ini — pangkalan data menunggu kemas kini 28. Selepas ia dijalankan, templat dikongsi seluruh pertubuhan."
                zh="模板目前只存在这台设备上 —— 等数据库更新 28 跑完，就会全机构共用。"
                en="Templates live on this device only for now — waiting for database update 28. Once applied, they are shared across the organisation."
              />
            </p>
          )}

          <Button variant="ghost" className="self-end" onClick={() => setOpen(false)}>
            <Tri bm="Tutup" zh="关闭" en="Close" />
          </Button>
        </div>
      </Modal>
    </div>
  );
}
