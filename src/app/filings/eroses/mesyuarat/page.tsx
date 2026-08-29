import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FenceCleanDownload } from "@/components/fence-ui";
import { Tri } from "@/components/language-provider";
import { buildMeetingFormPack, erosesMeetingKind } from "@/lib/eroses-meeting";
import { loadFlowBase } from "../flow-data";
import { FlowMeetingPicker, ValueRow } from "../penyata/flow-ui";
import { PortalSketch } from "../portal-sketch";

// /filings/eroses/mesyuarat — register ONE meeting on the portal (H2, work
// order 69). Its own address (Hard Rule 13): this is the prerequisite the
// Penyata flow's step 1 points at when the dropdown is empty, and a real job
// in its own right (every important meeting gets registered, AGM or not).

export const dynamic = "force-dynamic";

export default async function DaftarMesyuaratPage({
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

  const pack = base.selected
    ? buildMeetingFormPack({
        meetingType: base.selected.meetingType,
        meetingTypeLabel: base.selected.meetingTypeLabel,
        title: base.selected.title,
        meetingDateIso: base.selected.meetingDateIso,
        extraction: base.selected.extraction,
      })
    : null;
  // 28/8 evening item 8 (kept from the retired /filings page): a meeting the
  // portal's dropdown has no honest option for gets the CONCLUSION first —
  // the values stay one fold away for the person who registers it anyway.
  const registrable =
    base.selected !== null && erosesMeetingKind(base.selected.meetingType) !== null;
  const locked = base.fence !== null;

  // The portal's upload box wants the CLEAN BM PDF — for a fenced org that is
  // the counted download; the default view stays watermarked (D44, kept from
  // the retired /filings page).
  const pdfBlock =
    base.selectedId !== null ? (
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <a href={`/api/minutes-pdf?id=${base.selectedId}`} target="_blank" rel="noreferrer">
            📄{" "}
            {base.fence ? (
              <Tri
                bm="PDF minit (bertera air — pratonton)"
                zh="会议记录 PDF（带水印预览）"
                en="Minutes PDF (watermarked preview)"
              />
            ) : (
              <Tri
                bm="Muat turun PDF minit (untuk kotak Muat Naik)"
                zh="下载会议记录 PDF（就是上传框要的文件）"
                en="Download the minutes PDF (the file the upload box takes)"
              />
            )}
          </a>
        </Button>
        {base.fence && (
          <FenceCleanDownload
            href={`/api/minutes-pdf?id=${base.selectedId}`}
            fallbackName={`minit-${base.selectedId}.pdf`}
            remaining={base.fence.downloadsRemaining}
          />
        )}
        <span className="text-sm text-muted-foreground">
          {base.fence ? (
            <Tri
              bm="Kotak Muat Naik eROSES perlukan versi BERSIH (PDF, bawah 25MB) — guna butang muat turun bersih."
              zh="eROSES 上传框要的是干净版（PDF、25MB 以内）—— 请用「干净下载」按钮。"
              en="The eROSES upload slot needs the CLEAN version (PDF, under 25MB) — use the clean-download button."
            />
          ) : (
            <Tri
              bm="PDF, bawah 25MB — sama seperti templat portal."
              zh="PDF、25MB 以内 —— 符合网站的要求。"
              en="PDF, under 25MB — what the portal accepts."
            />
          )}
        </span>
      </div>
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Daftar Mesyuarat di eROSES" zh="把会议登记进 eROSES" en="Register a meeting on eROSES" />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Buka eROSES di tab lain: Pertubuhan → Pengurusan Mesyuarat → Tambah. Salin nilai dari sini ke kotak yang sama nama."
            zh="在另一个浏览器分页打开 eROSES：Pertubuhan → Pengurusan Mesyuarat → Tambah。把这里的值贴进同名的格子。"
            en="Open eROSES in another tab: Pertubuhan → Pengurusan Mesyuarat → Tambah. Copy each value into the same-named box."
          />
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            <Tri bm="Mesyuarat yang didaftarkan" zh="要登记哪一场会议？" en="The meeting being registered" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {base.meetings.length === 0 ? (
            <p className="text-base text-muted-foreground">
              <Tri
                bm="Belum ada minit yang DISAHKAN. Sahkan minit mesyuarat anda dahulu —"
                zh="还没有已确认的会议记录。请先确认会议记录 ——"
                en="No CONFIRMED minutes yet. Confirm your meeting's minutes first —"
              />{" "}
              <Link href="/minutes" className="underline underline-offset-4">
                <Tri bm="Minit" zh="会议记录" en="Minutes" /> →
              </Link>
            </p>
          ) : (
            <Suspense fallback={null}>
              <FlowMeetingPicker
                meetings={base.meetings.map((m) => ({ id: m.id, label: m.label }))}
                selectedId={base.selectedId}
                basePath="/filings/eroses/mesyuarat"
              />
            </Suspense>
          )}
        </CardContent>
      </Card>

      {pack && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              <Tri bm="Borang Tambah Mesyuarat, kotak demi kotak" zh="Tambah Mesyuarat 表格，一格一格来" en="The Tambah Mesyuarat form, box by box" />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!registrable && (
              <p className="rounded-md border-2 border-[color:var(--v2-border)] bg-[color:var(--v2-card)] p-4 text-base">
                ✅{" "}
                <Tri
                  bm="Mesyuarat ini TIDAK perlu didaftarkan di eROSES. Dropdown portal hanya ada Mesyuarat Agung / Khas / AJK (dan pembubaran) — mesyuarat program/aktiviti seperti ini cukup disimpan dalam MinitAI. Kalau ia sebenarnya mesyuarat jawatankuasa, betulkan jenisnya pada minit itu."
                  zh="这场会议不用登记进 eROSES。portal 的下拉里只有 常年大会 / 特别大会 / 理事会议（和解散会议）—— 像这样的活动会议，记录留在 MinitAI 就够了。如果这场其实是理事开的会，就回去把那份记录的会议类型改成理事会议。"
                  en="This meeting does NOT need registering on eROSES. The portal's dropdown only has general / extraordinary / committee meetings (and dissolution) — a programme/activity meeting like this one is fully served by its MinitAI record. If this really was a committee sitting, fix that document's meeting type."
                />
              </p>
            )}
            <details open={registrable || undefined}>
              <summary
                className={
                  registrable
                    ? "hidden"
                    : "cursor-pointer text-sm text-muted-foreground underline underline-offset-4"
                }
              >
                <Tri
                  bm="Saya nak daftarkannya juga — tunjukkan nilai medan"
                  zh="我还是要登记它 —— 展开逐栏的值"
                  en="I want to register it anyway — show the field values"
                />
              </summary>
              <div className="mt-1 flex flex-col gap-3">
                <PortalSketch step="mesyuarat" />
                {pack.map((row) => (
                  <ValueRow
                    key={row.field}
                    id={`m-${row.field}`}
                    labelBm={row.field}
                    labelSub={
                      <span>
                        {row.fieldEn}
                        {row.note && (
                          <span className="block">
                            <Tri bm={row.note.bm} zh={row.note.zh} en={row.note.en} />
                          </span>
                        )}
                      </span>
                    }
                    value={row.copyable && row.value !== "—" ? row.value : null}
                    locked={locked}
                    fix={
                      row.note ? (
                        <Tri bm={row.note.bm} zh={row.note.zh} en={row.note.en} />
                      ) : (
                        <Tri bm="Isi terus di portal." zh="直接在 portal 上填。" en="Fill it straight on the portal." />
                      )
                    }
                  />
                ))}
                <p className="text-base">
                  📄{" "}
                  <Tri
                    bm="Kotak “Muat Naik Minit Mesyuarat” mahu PDF minit BM:"
                    zh="「Muat Naik Minit Mesyuarat」那格要马来文会议记录 PDF："
                    en="The “Muat Naik Minit Mesyuarat” box wants the BM minutes PDF:"
                  />
                </p>
                {pdfBlock}
              </div>
            </details>
            <p className="text-sm text-muted-foreground">
              <Tri
                bm="Selepas mesyuarat disimpan di portal, ia akan muncul dalam dropdown Senarai Mesyuarat langkah 1 Penyata Tahunan."
                zh="在 portal 存好之后，这场会就会出现在年度呈报第 1 步的 Senarai Mesyuarat 下拉里。"
                en="Once saved on the portal, the meeting appears in the Annual Return step 1's Senarai Mesyuarat dropdown."
              />{" "}
              <Link
                href={`/filings/eroses/penyata${base.selectedId ? `?doc=${base.selectedId}` : ""}`}
                className="underline underline-offset-4"
              >
                <Tri bm="Ke Penyata Tahunan" zh="去年度呈报" en="To the Annual Return" /> →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
