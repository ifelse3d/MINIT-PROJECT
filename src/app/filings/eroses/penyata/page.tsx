import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { isErosesFileable } from "@/lib/meeting-types";
import { loadFlowBase, loadFlowMaklumat, resolveRange } from "../flow-data";
import { FlowMeetingPicker } from "./flow-ui";

// The flow's START: which meeting, which financial year — then step 1.
// Empty states are LOUD (G3-5): an internal committee or an empty history
// must never read as "nothing works".

export const dynamic = "force-dynamic";

export default async function PenyataStartPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string | string[]; dari?: string; hingga?: string }>;
}) {
  const sp = await searchParams;
  const base = await loadFlowBase(sp.doc);

  if (!base.active) {
    return (
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
    );
  }

  if (base.orgType === "committee") {
    return (
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
            bm="Hanya pertubuhan berdaftar (PPM/ROS) memfailkan Penyata Tahunan. Untuk mencuba aliran ini, buka pertubuhan jenis “berdaftar”."
            zh="只有注册社团（PPM/ROS）需要交年报。想试这条 flow，请用「注册社团」类型的机构。"
            en="Only a registered society (PPM/ROS) files the Annual Return. To try this flow, use an organisation of the “registered” type."
          />
        </p>
      </div>
    );
  }

  if (base.meetings.length === 0) {
    return (
      <div className="rounded-md border-2 border-[#a855f7]/50 bg-purple-50/70 p-5 dark:bg-purple-400/10">
        <p className="text-xl font-bold">
          1️⃣{" "}
          <Tri
            bm="Langkah pertama: simpan satu minit mesyuarat yang DISAHKAN dahulu."
            zh="第一步：先去存一份确认过的会议记录。"
            en="First step: save one CONFIRMED set of minutes."
          />
        </p>
        <p className="mt-2 text-base text-muted-foreground">
          <Tri
            bm="Aliran ini mengisi Penyata Tahunan daripada minit yang sudah disahkan — sejarah anda masih kosong, jadi belum ada apa-apa untuk diisi."
            zh="这条 flow 是用已确认的会议记录来填年报的 —— 您的历史还是空的，所以现在没有东西可填。"
            en="This flow fills the Annual Return from confirmed minutes — your history is still empty, so there is nothing to fill in yet."
          />
        </p>
        <p className="mt-3">
          <Link
            href="/minutes"
            className="inline-block rounded-md bg-[color:var(--v2-primary-fill,#7c3aed)] px-5 py-2.5 text-base font-semibold text-white"
          >
            <Tri bm="Rekod mesyuarat sekarang" zh="现在去记录会议" en="Record a meeting now" /> →
          </Link>
        </p>
      </div>
    );
  }

  // The financial year the Penyata will cover (step 5 uses it; carried in the
  // step links so every page agrees).
  const maklumat = await loadFlowMaklumat(base.active.id);
  const { fromIso, toIso } = resolveRange(
    base.todayIso,
    maklumat?.financialYearStart ?? null,
    sp.dari,
    sp.hingga,
  );
  const fileable =
    base.selected !== null && isErosesFileable(base.selected.meetingType);
  const startQuery = `?doc=${base.selectedId}&dari=${fromIso}&hingga=${toIso}`;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            <Tri bm="Mesyuarat yang difailkan" zh="要呈报哪一场会议？" en="The meeting being filed" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Suspense fallback={null}>
            <FlowMeetingPicker
              meetings={base.meetings.map((m) => ({ id: m.id, label: m.label }))}
              selectedId={base.selectedId}
            />
          </Suspense>
          {!fileable && base.selectedId !== null && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
              <Tri
                bm="Penyata Tahunan dibina daripada mesyuarat agung (AGM/EGM). Mesyuarat yang dipilih bukan AGM/EGM — pilih yang betul di atas, atau sahkan minit AGM anda dahulu."
                zh="年度呈报要用会员大会（AGM/EGM）的资料。现在选的这场不是 AGM/EGM —— 请在上面换一场，或先确认 AGM 的会议记录。"
                en="The Annual Return is built from a general meeting (AGM/EGM). The selected meeting is not one — pick the right one above, or confirm your AGM minutes first."
              />
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            <Tri
              bm={`Tahun kewangan penyata ini: ${fromIso} hingga ${toIso} (daripada rekod pertubuhan; langkah 5 menggunakannya).`}
              zh={`这份呈报的财政年度：${fromIso} 至 ${toIso}（照机构档案算的；第 5 步会用到）。`}
              en={`This return's financial year: ${fromIso} to ${toIso} (from the organisation's record; step 5 uses it).`}
            />
          </p>
          <p className="text-sm text-muted-foreground">
            ⚠{" "}
            <Tri
              bm="Nama medan di portal boleh berubah — semak dengan skrin sebenar semasa menampal."
              zh="portal 上的栏位名称可能改动 —— 贴的时候对一眼真画面。"
              en="Portal field names can change — glance at the live screen as you paste."
            />
          </p>
          <div>
            <Button asChild size="lg" data-probe="start-flow">
              <Link href={`/filings/eroses/penyata/langkah/1${startQuery}`}>
                <Tri bm="Mula langkah 1 · Mesyuarat" zh="开始第 1 步 · 会议" en="Start step 1 · Meeting" /> →
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
