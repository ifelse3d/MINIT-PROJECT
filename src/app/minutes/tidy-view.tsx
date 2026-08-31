"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { PageSection } from "@/components/page-section";
import { usableResolutions } from "@/lib/minutes-compose";
import type { TidyDocument, TidyItem } from "@/lib/tidy-minutes";
import type { MeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// TWO LAYERS, TWO TABS (work order 105 §2-3).
//
// J, 2026-08-31 night, looking at what came out of two pages of one meeting:
// 「更新後的 AGENT 也是智障…就只是摳字出來」— the agenda ran "3. 4. 5." and
// then "1. 2.1 4. 5.", and every line read like the shorthand it was scribbled
// in. So there are two views of the same meeting now:
//
//   「正式版」 (default) — the reading copy: ordered, the same item told twice
//                          folded into one, shorthand finished into sentences,
//                          each in the paper's own language.
//   「原文（逐字）」      — every line exactly as it was read off the paper.
//
// 🔴 THE VERBATIM LAYER IS THE ARCHIVE, AND THE PAGE SAYS SO. eROSES, the
// download and the confirm flow all read the verbatim layer. The formal
// version is a DERIVATIVE — which is why every one of its paragraphs carries
// a control that opens the exact line (or lines) it was made from. Anything
// the reading copy shows can be traced home in one tap; nothing it shows can
// replace what it was traced from.
//
// 🔴 Icons: 📑 (a document) and ✍ (a hand writing). Objects and actions —
// neither points at any community. Checked against the house rule.
// ---------------------------------------------------------------------------

type Tab = "tidy" | "verbatim";

export function TidyView({
  extraction,
  /** true once the person has an org and a real reading to work with. */
  enabled,
}: {
  extraction: MeetingNotesExtraction;
  enabled: boolean;
}) {
  const t = useTriText();
  const [tab, setTab] = useState<Tab>("tidy");
  const [tidy, setTidy] = useState<TidyDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which paragraph has its verbatim original open. */
  const [openSource, setOpenSource] = useState<string | null>(null);

  const rows = usableResolutions(extraction);
  const verbatim = rows.map((r) => r.text.value);

  async function makeTidy() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tidy-minutes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extraction }),
      });
      const body = (await res.json().catch(() => null)) as {
        tidy?: TidyDocument | null;
        error?: string;
      } | null;
      if (!res.ok || !body) {
        setError(
          body?.error ??
            t(
              "MinitAI tidak dapat menyusun versi rasmi kali ini.",
              "MinitAI 这次没能整理出正式版。",
              "MinitAI could not put the formal version together this time.",
            ),
        );
        return;
      }
      if (!body.tidy) {
        setError(body.error ?? null);
        return;
      }
      setTidy(body.tidy);
    } catch {
      setError(
        t(
          "Sambungan internet terputus. Tiada apa-apa dicaj. Cuba sekali lagi.",
          "网络断了，一分都没扣。请再试一次。",
          "The connection dropped — nothing was charged. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function Paragraph({ item, id }: { item: TidyItem; id: string }) {
    const open = openSource === id;
    return (
      <div className="flex flex-col gap-1">
        <p className="whitespace-pre-wrap text-base leading-relaxed">
          {item.text}{" "}
          <button
            type="button"
            data-probe="tidy-source"
            onClick={() => setOpenSource(open ? null : id)}
            className="align-baseline text-sm text-[color:var(--v2-primary)] underline underline-offset-4"
          >
            <Tri bm="teks asal" zh="原文" en="original" /> ↩
          </button>
          {item.verbatimFallback && (
            <span className="ml-2 rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm="ditunjuk seperti asal"
                zh="照原文显示"
                en="shown as written"
              />
            </span>
          )}
        </p>
        {open && (
          <div className="rounded-md border-l-4 border-[color:var(--v2-primary)]/40 bg-black/[0.03] px-3 py-2 dark:bg-white/5">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              <Tri
                bm="Teks asal, perkataan demi perkataan"
                zh="原文，一字不改"
                en="The original, word for word"
              />
            </p>
            {item.source.map((s) => (
              <p key={s} className="whitespace-pre-wrap text-base">
                {verbatim[s] ?? ""}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <PageSection
      titleBm="Versi rasmi & teks asal"
      titleZh="正式版与原文"
      titleEn="Formal version & the original"
      summary={
        <Tri
          bm="Dua paparan bagi mesyuarat yang SAMA. 🔴 Yang dihantar ke eROSES, dimuat turun dan disahkan sentiasa TEKS ASAL — versi rasmi hanya senang dibaca, dan setiap perenggannya boleh dibuka balik kepada teks asalnya."
          zh="同一场会议的两个看法。🔴 送 eROSES、下载、确认，用的一律是「原文（逐字）」—— 正式版只是读起来顺的那一份，而且每一段都点得回它的原文。"
          en="Two views of the SAME meeting. 🔴 What goes to eROSES, what downloads and what you confirm is always the VERBATIM original — the formal version is only the readable one, and every paragraph of it opens back to the words it came from."
        />
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "tidy" ? "default" : "outline"}
          data-probe="tab-tidy"
          onClick={() => setTab("tidy")}
        >
          📑 <Tri bm="Versi rasmi" zh="正式版" en="Formal version" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "verbatim" ? "default" : "outline"}
          data-probe="tab-verbatim"
          onClick={() => setTab("verbatim")}
        >
          ✍ <Tri bm="Teks asal (verbatim)" zh="原文（逐字）" en="Original (verbatim)" />
        </Button>
      </div>

      {tab === "verbatim" && (
        <div data-probe="verbatim-pane" className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Inilah yang MinitAI baca daripada kertas itu, perkataan demi perkataan. Ini yang disimpan, dihantar dan disahkan."
              zh="这就是 MinitAI 从纸上读到的，一字不改。存档、送出、确认，都是这一份。"
              en="This is what MinitAI read off the paper, word for word. This is what is kept, sent and confirmed."
            />
          </p>
          {verbatim.length === 0 ? (
            <p className="text-base text-muted-foreground">
              <Tri bm="Tiada lagi." zh="还没有内容。" en="Nothing yet." />
            </p>
          ) : (
            <ol className="list-decimal space-y-1 pl-6">
              {verbatim.map((line, i) => (
                <li key={i} className="whitespace-pre-wrap text-base leading-relaxed">
                  {line}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {tab === "tidy" && (
        <div data-probe="tidy-pane" className="flex flex-col gap-3">
          {tidy === null ? (
            <>
              <p className="text-base text-muted-foreground">
                <Tri
                  bm="MinitAI boleh menyusun teks asal ini menjadi versi yang senang dibaca: turutan dibetulkan, perkara yang sama pada dua muka surat digabungkan, dan tulisan ringkas disiapkan menjadi ayat penuh — dalam bahasa kertas itu sendiri. Ia TIDAK membaca semula gambar dan TIDAK mengubah teks asal."
                  zh="MinitAI 可以把这份原文整理成读得顺的一份：顺序排好、两页上同一件事合成一条、简写补成完整句子 —— 用纸上原本的语言。它不会重读照片，也不会改动原文。"
                  en="MinitAI can arrange this original into something readable: put it in order, fold the same item told on two pages into one, and finish shorthand into full sentences — in the paper's own language. It does NOT re-read the photo and does NOT change the original."
                />
              </p>
              {verbatim.length === 0 && (
                <p className="text-base text-muted-foreground">
                  <Tri
                    bm="Belum ada apa-apa keputusan untuk disusun."
                    zh="还没有可以整理的内容。"
                    en="There is nothing to arrange yet."
                  />
                </p>
              )}
              <div>
                <Button
                  type="button"
                  onClick={() => void makeTidy()}
                  disabled={!enabled || busy || verbatim.length === 0}
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />{" "}
                      <Tri bm="Menyusun…" zh="整理中…" en="Tidying…" />
                    </>
                  ) : (
                    <>
                      📑 <Tri bm="Susun versi rasmi" zh="整理出正式版" en="Make the formal version" />
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm={`${tidy.merged > 0 ? `${tidy.merged} baris yang berulang digabungkan. ` : ""}Tekan "teks asal" pada mana-mana perenggan untuk melihat perkataan asalnya.${tidy.fallbacks > 0 ? ` ${tidy.fallbacks} perenggan ditunjukkan seperti asal kerana ayat MinitAI tidak lulus pemeriksaan.` : ""}`}
                  zh={`${tidy.merged > 0 ? `合并掉 ${tidy.merged} 条重复。` : ""}任何一段点「原文」就看得到它本来的字。${tidy.fallbacks > 0 ? ` 有 ${tidy.fallbacks} 段没通过检查，照原文显示。` : ""}`}
                  en={`${tidy.merged > 0 ? `${tidy.merged} repeated line(s) folded together. ` : ""}Tap "original" on any paragraph to see the words it came from.${tidy.fallbacks > 0 ? ` ${tidy.fallbacks} paragraph(s) are shown as written because MinitAI's sentence did not pass the checks.` : ""}`}
                />
              </p>
              {tidy.sections.map((section, si) => (
                <div key={si} className="flex flex-col gap-2">
                  <p className="border-b pb-1 text-sm font-semibold text-muted-foreground">
                    {section.heading}
                  </p>
                  {section.items.map((item, ii) => (
                    <Paragraph key={`${si}-${ii}`} item={item} id={`s${si}-${ii}`} />
                  ))}
                </div>
              ))}
              {tidy.unresolved.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="border-b pb-1 text-sm font-semibold text-muted-foreground">
                    <Tri
                      bm="Belum selesai"
                      zh="还没有结论的"
                      en="Still open"
                    />
                  </p>
                  {tidy.unresolved.map((item, ii) => (
                    <Paragraph key={`u-${ii}`} item={item} id={`u-${ii}`} />
                  ))}
                </div>
              )}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => setTidy(null)}>
                  <Tri bm="Susun semula" zh="重新整理" en="Tidy it again" />
                </Button>
              </div>
            </>
          )}
          {error && (
            <p className="whitespace-pre-line rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              {error}
            </p>
          )}
        </div>
      )}
    </PageSection>
  );
}
