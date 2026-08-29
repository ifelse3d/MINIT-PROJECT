import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { flowQuery, loadFlowBase, meetingLabelOf } from "./flow-data";

// ---------------------------------------------------------------------------
// /filings/eroses — the DOOR, not the work (H2, work order 69; J #12: 「一進來
// 只有幾個 CARD，問他是要報什麼做什麼…不是所有都擠在一個」).
//
// Three cards, three jobs, three addresses (Hard Rule 13):
//   * register a meeting  → /filings/eroses/mesyuarat
//   * the Annual Return   → /filings/eroses/penyata (the nine-step flow)
//   * the deadlines       → /filings/eroses/tarikh
//
// ?doc=<id> (from the finished-minutes page's "file this?" question) rides
// along into whichever card is chosen, so the meeting stays chosen.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function ErosesEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string | string[] }>;
}) {
  const sp = await searchParams;
  const base = await loadFlowBase(sp.doc);

  if (!base.active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="v2-glass p-5 text-base">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建机构"
              en="Choose or create an organisation first"
            />{" "}
            →
          </Link>
        </p>
      </div>
    );
  }

  const q = flowQuery(sp);
  const selectedLabel = base.selected ? meetingLabelOf(base.selected) : null;

  const cards: {
    href: string;
    icon: string;
    titleBm: string;
    titleZh: string;
    titleEn: string;
    bm: string;
    zh: string;
    en: string;
    probe: string;
  }[] = [
    {
      href: `/filings/eroses/mesyuarat${q}`,
      icon: "🗓️",
      titleBm: "Daftar Mesyuarat",
      titleZh: "登记会议",
      titleEn: "Register a meeting",
      bm: "Daftarkan satu mesyuarat di Pengurusan Mesyuarat dan muat naik PDF minitnya — panduan salin-tampal.",
      zh: "把一场会议登记进 Pengurusan Mesyuarat、上传会议记录 PDF —— 一格一格带你贴。",
      en: "Register one meeting under Pengurusan Mesyuarat and upload its minutes PDF — a copy-paste guide.",
      probe: "card-mesyuarat",
    },
    {
      href: `/filings/eroses/penyata${q}`,
      icon: "📋",
      titleBm: "Penyata Tahunan",
      titleZh: "年度呈报",
      titleEn: "Annual Return",
      bm: "Kerja sekali setahun (perlu AGM): sembilan langkah portal, satu langkah satu halaman, nilai siap disalin.",
      zh: "一年一次的大件事（要有 AGM）：portal 的九步，一步一页，值都替你算好等着复制。",
      en: "The once-a-year job (needs an AGM): the portal's nine steps, one page each, every value ready to copy.",
      probe: "card-penyata",
    },
    {
      href: "/filings/eroses/tarikh",
      icon: "⏰",
      titleBm: "Tarikh Akhir",
      titleZh: "看截止日",
      titleEn: "Deadlines",
      bm: "Bila penyata tahunan perlu dihantar, dan tarikh akhir lain yang sedang berjalan.",
      zh: "年报什么时候要交、还有哪些截止日在倒数。",
      en: "When the Annual Return is due, and every other deadline on the clock.",
      probe: "card-tarikh",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="eROSES — nak buat apa?" zh="eROSES —— 要办哪一件事？" en="eROSES — what are you here to do?" />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Pilih kerja anda — setiap satu ada halaman panduannya sendiri."
            zh="选你要办的事 —— 每一件都有自己的引导页。"
            en="Pick the job — each one has its own guided pages."
          />
        </p>
        {selectedLabel && (
          <p className="text-sm text-muted-foreground">
            <Tri bm="Mesyuarat dipilih:" zh="已选的会议：" en="Selected meeting:" />{" "}
            <span className="font-medium text-[color:var(--v2-text)]">{selectedLabel}</span>
          </p>
        )}
      </div>

      {base.orgType === "committee" && (
        <div className="rounded-md border-2 border-amber-400 bg-amber-50 p-5 dark:bg-amber-400/10">
          <p className="text-xl font-bold text-amber-900 dark:text-amber-100">
            🏛️{" "}
            <Tri
              bm="Pertubuhan ini jawatankuasa dalaman — ia TIDAK perlu memfailkan eROSES."
              zh="这个机构是内部委员会 —— 不用呈报 eROSES。"
              en="This organisation is an internal committee — it does NOT file to eROSES."
            />
          </p>
          <p className="mt-2 text-base text-amber-900/90 dark:text-amber-100/90">
            <Tri
              bm="Kad di bawah kekal untuk rujukan sahaja."
              zh="下面的卡片仅供参考。"
              en="The cards below stay for reference only."
            />
          </p>
        </div>
      )}

      <div className="grid gap-4 @2xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.probe} href={c.href} className="group" data-probe={c.probe}>
            <Card className="h-full transition group-hover:border-[color:var(--v2-primary)]">
              <CardContent className="flex h-full flex-col gap-2 pt-6">
                <div className="text-3xl">{c.icon}</div>
                <div className="text-lg font-semibold">
                  {c.titleBm}
                  <span className="block text-base font-normal text-muted-foreground">
                    <Tri bm="" zh={c.titleZh} en={c.titleEn} />
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  <Tri bm={c.bm} zh={c.zh} en={c.en} />
                </p>
                <span className="mt-auto pt-2 text-base font-medium text-[color:var(--v2-primary)]">
                  <Tri bm="Mula" zh="进去" en="Open" /> →
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
