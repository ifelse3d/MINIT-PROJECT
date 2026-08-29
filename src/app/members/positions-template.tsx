"use client";

// "加常見職位" — the roster's standard skeleton in one tap (H1, work order
// 69 §1-5, J's decision), plus the constitution's own composition when the
// society has confirmed one ("照章程要 X 名，现在有 Y 名").
//
// The button sends EXACTLY the list it showed the person (positions JSON) —
// the server inserts nothing it did not display. Rows arrive with an empty
// name, shown as amber "belum diisi", which the row's Edit button fills in.

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useLocalizedError } from "@/components/language-provider";
import { seedCommonPositions, type MemberActionState } from "./actions";

const INITIAL: MemberActionState = { error: null, ok: false };

/** The standard Malaysian society committee, when no constitution says otherwise. */
export const DEFAULT_POSITIONS: { position: string; count: number }[] = [
  { position: "Pengerusi / 主席", count: 1 },
  { position: "Naib Pengerusi / 副主席", count: 1 },
  { position: "Setiausaha / 秘书", count: 1 },
  { position: "Bendahari / 财政", count: 1 },
  { position: "Ahli Jawatankuasa (AJK) / 理事", count: 3 },
];

export type RequirementLine = { title: string; required: number; have: number };

export function PositionsTemplate({
  /** From the constitution when one was read; null → the default set. */
  requirement,
  /** "照章程要 X 名，现在有 Y 名" lines, when a constitution answered. */
  requirementLines,
  clauseNo,
  rosterEmpty,
}: {
  requirement: { position: string; count: number }[] | null;
  requirementLines: RequirementLine[] | null;
  clauseNo: string | null;
  rosterEmpty: boolean;
}) {
  const [state, formAction, pending] = useActionState(seedCommonPositions, INITIAL);
  const localizeError = useLocalizedError();
  const positions = requirement ?? DEFAULT_POSITIONS;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-input bg-white/40 p-3 dark:bg-white/5">
      {/* The constitution's answer, when there is one — shown so the person
          can check us against the clause it names. Display only: nothing
          here blocks anything (the rule bites at the filing). */}
      {requirementLines && clauseNo && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            <Tri
              bm={`Ikut perlembagaan anda (${clauseNo}):`}
              zh={`照你们的章程（${clauseNo}）：`}
              en={`Your constitution says (${clauseNo}):`}
            />
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {requirementLines.map((line) => (
              <span
                key={line.title}
                className={
                  line.have < line.required
                    ? "font-medium text-amber-700 dark:text-amber-300"
                    : undefined
                }
              >
                {line.title}:{" "}
                <Tri
                  bm={`perlu ${line.required}, ada ${line.have}`}
                  zh={`要 ${line.required} 名，现在有 ${line.have} 名`}
                  en={`needs ${line.required}, has ${line.have}`}
                />
              </span>
            ))}
          </div>
        </div>
      )}

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="positions" value={JSON.stringify(positions)} />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? (
            <Tri bm="Menambah…" zh="加入中…" en="Adding…" />
          ) : (
            <Tri
              bm="＋ Tambah jawatan biasa"
              zh="＋ 加常见职位"
              en="＋ Add the common positions"
            />
          )}
        </Button>
        <span className="text-sm text-muted-foreground">
          {rosterEmpty ? (
            <Tri
              bm="Mula dengan jawatan standard — isi nama kemudian dengan butang Edit."
              zh="先起好标准职位表，名字之后按 Edit 补。"
              en="Start with the standard positions — fill in names later with Edit."
            />
          ) : (
            <Tri
              bm="Menambah jawatan yang belum ada sahaja — tidak menduakan."
              zh="只补还没有的职位，不会重复加。"
              en="Adds only the positions you do not have yet — no duplicates."
            />
          )}
        </span>
      </form>
      {/* Pemeriksa Kira-kira live on the auditors card below, not in the AJK
          list — a different eROSES step, said here so nobody looks for them. */}
      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Pemeriksa Kira-kira direkodkan dalam kad Juruaudit di bawah — ia langkah eROSES yang berasingan."
          zh="Pemeriksa Kira-kira（查账）记在下面的审计员卡 —— 那是 eROSES 另外一步。"
          en="Pemeriksa Kira-kira go on the Auditors card below — that is a separate eROSES step."
        />
      </p>
      {state.ok && (
        <p className="text-base font-medium text-green-700 dark:text-green-300">
          ✓ <Tri bm="Ditambah" zh="加好了" en="Added" />
        </p>
      )}
      {state.error && (
        <p className="rounded-md border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
          {localizeError(state.error)}
        </p>
      )}
    </div>
  );
}
