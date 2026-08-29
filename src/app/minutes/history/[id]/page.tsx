import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { getFenceState } from "@/lib/fence";
import { FenceCleanDownload, FenceLock } from "@/components/fence-ui";
import { meetingTypeUiLabelTri } from "@/lib/meeting-types";
import { formatMytDateTime } from "@/lib/history";
import { MINUTES_STATUS_LABEL, labelFor } from "@/lib/status-labels";
import { MinutesHistoryActions } from "../history-actions";
import { HistoryPhotoStrip } from "../photo-strip";
import { SuggestionCards } from "../suggestion-cards";
import { loadSuggestionsForDoc } from "../suggestions-data";

// ---------------------------------------------------------------------------
// /minutes/history/<id> — ONE finished minutes document, on its own page.
//
// J 28/8 evening, items 2+6+7 in one place: after 保存 the app lands HERE
// (the final preview he asked for), 🖨 Print/PDF is right on it (no more
// hunting through the history list to print what was just made), the source
// photos open in the zooming popup, and ✏️ Edit works in place with the
// who/when stamp. From the history list, tapping a document's name opens
// this page — that is the "choose one and open it" the list never had.
//
// Server component, user-scoped client: RLS decides visibility, same as the
// list. The same SELECT ladder too — the DB may be older than the code (D8).
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";

type Row = {
  id: number;
  meeting_type: string | null;
  meeting_type_label?: string | null;
  meeting_date: string | null;
  status: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  final_md: string;
  title?: string | null;
  edited_at?: string | null;
  edited_by?: string | null;
  photo_paths?: unknown;
  /** The reviewed extraction stored with the confirmation (S0-5) — what the
   *  suggestion cards derive from. Absent on the SELECT_BASE fallback. */
  extraction?: unknown;
};

const SELECT_FULL =
  "id, meeting_type, meeting_type_label, meeting_date, status, confirmed_by, confirmed_at, final_md, title, edited_at, edited_by, photo_paths, extraction";
const SELECT_BASE =
  "id, meeting_type, meeting_date, status, confirmed_by, confirmed_at, final_md";

export default async function MinutesDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = /^\d{1,10}$/.test(idRaw) ? Number(idRaw) : null;
  const active = await getActiveOrg();

  const backToList = (
    <Link
      href="/minutes/history"
      className="text-base underline underline-offset-4"
    >
      ← <Tri bm="Semua minit" zh="以前的记录" en="All minutes" />
    </Link>
  );

  if (!active || id === null) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="mb-4 text-muted-foreground">
          {!active ? (
            <Link href="/orgs" className="underline">
              <Tri
                bm="Pilih atau cipta pertubuhan dahulu"
                zh="请先选择或创建组织"
                en="Choose or create an organisation first"
              />
            </Link>
          ) : (
            <Tri
              bm="Alamat ini tidak sah."
              zh="这个地址不对。"
              en="That address is not valid."
            />
          )}
        </p>
        {backToList}
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  const runQuery = (select: string) =>
    supabase
      .from("minutes_docs")
      .select(select)
      .eq("org_id", active.id)
      .eq("id", id)
      .maybeSingle();
  let { data: doc, error } = await runQuery(SELECT_FULL);
  if (error) {
    const retry = await runQuery(SELECT_BASE);
    doc = retry.data;
    error = retry.error;
  }
  const d = (doc ?? null) as Row | null;

  if (!d) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <p className="mb-4 rounded-md border-2 border-dashed p-4 text-base text-muted-foreground">
          <Tri
            bm="Minit ini tiada dalam sejarah pertubuhan ini — mungkin ia milik pertubuhan lain, atau sudah dipadam."
            zh="这个机构的历史里没有这份会议记录 —— 可能属于别的机构，或已被删除。"
            en="These minutes are not in this organisation's history — they may belong to another organisation, or have been removed."
          />
        </p>
        {backToList}
      </div>
    );
  }

  const title = (d.title ?? "").trim();
  const typeLabel = meetingTypeUiLabelTri(d.meeting_type ?? "", d.meeting_type_label);

  // D44: null = paid org, everything stays exactly as it was.
  const fence = await getFenceState(active);

  // The handwriting behind this document — short-lived signed links into the
  // private uploads bucket, same idiom as the list page.
  const paths = Array.isArray(d.photo_paths)
    ? (d.photo_paths as unknown[]).filter(
        (p): p is string => typeof p === "string" && p !== "",
      )
    : [];
  const photos: { path: string; url: string }[] = [];
  for (const path of paths.slice(0, 8)) {
    const { data } = await supabase.storage
      .from("uploads")
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) photos.push({ path, url: data.signedUrl });
  }

  // Work order 64: the AI suggestion cards — derived from the confirmed
  // extraction by rules, zero vendor calls, written only on a human's
  // confirm. null = nothing to suggest (or this viewer cannot act on any).
  const suggestionData =
    d.status === "confirmed" && d.extraction != null
      ? await loadSuggestionsForDoc({
          orgId: active.id,
          role: active.role,
          docId: d.id,
          extractionRaw: d.extraction,
        })
      : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {backToList}
        <Link
          href="/minutes"
          className="text-base underline underline-offset-4"
        >
          <Tri
            bm="Mula mesyuarat baharu"
            zh="开始记录新的会议"
            en="Start a new meeting"
          />{" "}
          →
        </Link>
      </div>

      {/* D3 (work order 56, 拍板 9): the save lands HERE — so here is where
          the app asks "file it to eROSES?". The guide walks all nine portal
          steps with a COPY button per value. */}
      {d.status === "confirmed" && (
        <p className="rounded-md border-2 border-[#a855f7]/40 bg-purple-50/60 p-4 text-base font-medium dark:bg-purple-400/10">
          🏛️{" "}
          <Tri
            bm="Mahu failkan mesyuarat ini ke eROSES?"
            zh="要把这场会议呈报 eROSES 吗？"
            en="File this meeting to eROSES?"
          />{" "}
          <Link
            href={`/filings/eroses?doc=${d.id}`}
            className="underline underline-offset-4"
          >
            <Tri
              bm="Panduan langkah demi langkah"
              zh="一步一步带你填"
              en="Step-by-step guide"
            />{" "}
            →
          </Link>
        </p>
      )}

      {/* 64 §4: suggestion cards live on the finished-document side (D36 —
          the workspace is never touched). */}
      {suggestionData && (
        <SuggestionCards
          docId={d.id}
          suggestions={suggestionData.suggestions}
          ignoredCount={suggestionData.ignoredCount}
          marksStored={suggestionData.marksStored}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">
                {title !== "" ? (
                  title
                ) : (
                  <>
                    <Tri {...typeLabel} />
                    {d.meeting_date ? ` — ${d.meeting_date}` : ""}
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {title !== "" && (
                  <>
                    <Tri {...typeLabel} />
                    {d.meeting_date ? ` — ${d.meeting_date}` : ""}
                    {" · "}
                  </>
                )}
                <Tri bm="Disahkan oleh" zh="确认人" en="Confirmed by" />{" "}
                {d.confirmed_by ?? "—"}
                {d.confirmed_at ? ` · ${formatMytDateTime(d.confirmed_at)}` : ""}
                {d.edited_at && (
                  <>
                    {" · "}
                    <Tri bm="Dipinda" zh="上次修改" en="Edited" />{" "}
                    {formatMytDateTime(d.edited_at)}
                    {d.edited_by ? ` (${d.edited_by})` : ""}
                  </>
                )}
              </CardDescription>
            </div>
            <Badge className="bg-green-600 text-white hover:bg-green-600">
              <Tri {...labelFor(MINUTES_STATUS_LABEL, d.status)} />
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <a
                href={`/api/minutes-pdf?id=${d.id}`}
                target="_blank"
                rel="noreferrer"
              >
                🖨{" "}
                {fence ? (
                  <Tri
                    bm="Cetak / PDF (bertera air)"
                    zh="打印 / PDF（带水印）"
                    en="Print / PDF (watermarked)"
                  />
                ) : (
                  <Tri bm="Cetak / PDF" zh="打印 / PDF" en="Print / PDF" />
                )}
              </a>
            </Button>
            {/* D44: the clean file (the one eROSES takes) is the counted door. */}
            {fence && (
              <FenceCleanDownload
                href={`/api/minutes-pdf?id=${d.id}`}
                fallbackName={`minit-${d.meeting_date ?? d.id}.pdf`}
                remaining={fence.remaining.downloads}
              />
            )}
            <span className="text-sm text-muted-foreground">
              {fence ? (
                <Tri
                  bm="Fail untuk 'Muat Naik Minit Mesyuarat' di eROSES ialah versi BERSIH — guna butang muat turun bersih."
                  zh="eROSES「上传会议记录」要的是干净版 —— 请用「干净下载」按钮。"
                  en="The file eROSES's upload slot takes is the CLEAN one — use the clean-download button."
                />
              ) : (
                <Tri
                  bm="PDF ini juga fail untuk 'Muat Naik Minit Mesyuarat' di eROSES."
                  zh="这份 PDF 也就是 eROSES「上传会议记录」要的那个文件。"
                  en="This PDF is also the file eROSES's 'Muat Naik Minit Mesyuarat' slot takes."
                />
              )}
            </span>
          </div>

          {/* The finished document itself — the final look-over. D44: for a
              fenced org the on-screen text is watermarked and not copyable. */}
          <FenceLock active={fence !== null}>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm leading-relaxed">
              {d.final_md}
            </pre>
          </FenceLock>

          <HistoryPhotoStrip photos={photos} />

          {/* ✏️ Edit in place (who/when stamped by the server). The big print
              button above already covers printing, so the small one is off. */}
          <MinutesHistoryActions docId={d.id} finalMd={d.final_md} showPrint={false} />
        </CardContent>
      </Card>
    </div>
  );
}
