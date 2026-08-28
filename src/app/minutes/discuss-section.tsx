"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useLangs, useLocalizedError, useTriText } from "@/components/language-provider";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import type { DiscussSectionKind } from "@/prompts/discuss-minutes";
import { useMinutes, type TextLikeField } from "./minutes-store";

// ---------------------------------------------------------------------------
// 「每個 PART 跟 AI 討論」 (J review 27-evening #31, approved 2026-08-28 with
// the billing he chose: 改一次算一次 — ONE AI action per exchange, and the
// button says so before anything is spent).
//
// The model DISCUSSES and PROPOSES; the person APPLIES. Each proposal is a
// before→after on one row, applied through the same updateField path every
// hand edit takes — so an applied proposal is a human-accepted fact with an
// honest source_ref, and nothing the model says can reach the document
// without a tap. Names/amounts stay off-limits in the prompt AND in which
// fields this component exposes (descriptions and positions, never numbers,
// never person names).
// ---------------------------------------------------------------------------

type Exchange = {
  instruction: string;
  reply: string;
  proposals: { index: number; text: string; applied: boolean }[];
};

const SECTION_LABEL: Record<
  DiscussSectionKind,
  { bm: string; zh: string; en: string }
> = {
  meeting: { bm: "butiran mesyuarat", zh: "会议基本资料", en: "the meeting details" },
  resolutions: { bm: "keputusan mesyuarat", zh: "会议决定", en: "the decisions" },
  figures: { bm: "butiran wang", zh: "款项的说明", en: "the money descriptions" },
  bearers: { bm: "nama jawatan", zh: "职位名称", en: "the position titles" },
};

export function DiscussSection({ section }: { section: DiscussSectionKind }) {
  const t = useTriText();
  // mode may be "all" — the route falls back to zh for anything that is not
  // a single language, which is the right reply language for J's committee.
  const { mode } = useLangs();
  const localizeError = useLocalizedError();
  const { extraction, isReal, updateField } = useMinutes();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchange, setExchange] = useState<Exchange | null>(null);

  // Sample/empty workspaces have nothing to discuss — and must not spend.
  if (!isReal) return null;

  /** The section's editable rows — see the header for what is left OUT. */
  function rowsOf(): { index: number; label: string; text: string }[] {
    switch (section) {
      case "meeting":
        return [
          {
            index: 0,
            label: t("Tempat", "地点", "Venue"),
            text: extraction.meeting_venue.value,
          },
        ];
      case "resolutions":
        return extraction.resolutions.map((r, i) => ({
          index: i,
          label: t("Perkara", "内容", "Item"),
          text: r.text.value,
        }));
      case "figures":
        return extraction.figures.map((f, i) => ({
          index: i,
          label: t("Butiran", "说明", "Description"),
          text: f.description.value,
        }));
      case "bearers":
        return extraction.office_bearers.map((b, i) => ({
          index: i,
          label: t("Jawatan", "职位", "Position"),
          text: b.position.value,
        }));
    }
  }

  function fieldAt(e: typeof extraction, index: number): TextLikeField | null {
    switch (section) {
      case "meeting":
        return index === 0 ? (e.meeting_venue as TextLikeField) : null;
      case "resolutions":
        return (e.resolutions[index]?.text as TextLikeField) ?? null;
      case "figures":
        return (e.figures[index]?.description as TextLikeField) ?? null;
      case "bearers":
        return (e.office_bearers[index]?.position as TextLikeField) ?? null;
    }
  }

  async function send() {
    const ask = instruction.trim();
    if (ask === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discuss-minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          instruction: ask,
          rows: rowsOf(),
          uiLang: mode,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { reply?: string; proposals?: { index: number; text: string }[]; error?: string }
        | null;
      if (!res.ok || !body?.reply) {
        setError(body?.error ?? joinUserError(USER_ERRORS.aiUnavailable));
        return;
      }
      setExchange({
        instruction: ask,
        reply: body.reply,
        proposals: (body.proposals ?? []).map((p) => ({ ...p, applied: false })),
      });
      setInstruction("");
    } catch {
      setError(joinUserError(USER_ERRORS.aiUnavailable));
    } finally {
      setBusy(false);
    }
  }

  function applyProposal(i: number) {
    if (!exchange) return;
    const p = exchange.proposals[i];
    if (!p || p.applied) return;
    updateField((e) => {
      const f = fieldAt(e, p.index);
      if (!f) return e;
      f.source_ref = {
        location: t(
          "cadangan AI, diterima oleh anda",
          "AI 建议，您采用",
          "AI suggestion, accepted by you",
        ),
        snippet: f.value,
      };
      f.value = p.text;
      // The person read it and tapped Apply — that IS the confirmation.
      f.confidence = "confirmed";
      return e;
    });
    setExchange({
      ...exchange,
      proposals: exchange.proposals.map((x, j) =>
        j === i ? { ...x, applied: true } : x,
      ),
    });
  }

  const label = SECTION_LABEL[section];
  const currentRows = rowsOf();

  return (
    <div className="mt-3 border-t pt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-base text-muted-foreground underline underline-offset-4"
        >
          💬{" "}
          {t(
            `Bincang ${label.bm} dengan AI (1 tindakan AI setiap hantaran)`,
            `跟 AI 讨论${label.zh}（发一次用 1 次 AI 额度）`,
            `Discuss ${label.en} with the AI (1 AI action per message)`,
          )}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium">
            💬{" "}
            {t(
              `Bincang ${label.bm} dengan AI`,
              `跟 AI 讨论${label.zh}`,
              `Discuss ${label.en} with the AI`,
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="AI hanya mencadangkan susunan kata — anda yang tekan “Guna” sebelum apa-apa berubah. Nama orang dan jumlah wang tidak akan diubah."
              zh="AI 只提建议 —— 要您按「采用」才会改。人名和金额它一律不动。"
              en="The AI only proposes wording — nothing changes until you tap “Apply”. Names and amounts are never touched."
            />
          </p>
          {exchange && (
            <div className="flex flex-col gap-2 rounded-md border bg-[color:var(--v2-card)] p-3">
              <p className="text-sm text-muted-foreground">🧑 {exchange.instruction}</p>
              <p className="whitespace-pre-line text-base">🤖 {exchange.reply}</p>
              {exchange.proposals.map((p, i) => {
                const current = currentRows.find((r) => r.index === p.index);
                return (
                  <div key={i} className="rounded-sm border p-3">
                    <p className="text-sm text-muted-foreground line-through">
                      {current?.text || "—"}
                    </p>
                    <p className="text-base font-medium">{p.text}</p>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant={p.applied ? "ghost" : "default"}
                        disabled={p.applied || !current}
                        onClick={() => applyProposal(i)}
                      >
                        {p.applied ? (
                          <Tri bm="✓ Digunakan" zh="✓ 已采用" en="✓ Applied" />
                        ) : (
                          <Tri bm="Guna" zh="采用" en="Apply" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {error && (
            <p className="rounded-md border-2 border-red-300 bg-red-50 p-2 text-sm font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
              {localizeError(error)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={instruction}
              maxLength={600}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder={t(
                "cth: baris 2 terlalu panjang, pendekkan",
                "例如：第 2 条太长了，帮我精简",
                "e.g. line 2 is too long — tighten it",
              )}
              className="h-11 min-w-0 flex-1 rounded-sm border-2 border-input bg-white px-3 text-base dark:bg-transparent"
              aria-label={t("Soalan anda", "您想说什么", "Your message")}
            />
            <Button onClick={send} disabled={busy || instruction.trim() === ""}>
              {busy ? (
                <Tri bm="AI berfikir…" zh="AI 思考中…" en="AI is thinking…" />
              ) : (
                <Tri
                  bm="Hantar (1 tindakan AI)"
                  zh="发送（用 1 次 AI 额度）"
                  en="Send (1 AI action)"
                />
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              <Tri bm="Tutup" zh="收起" en="Close" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
