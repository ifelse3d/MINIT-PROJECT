import { MINUTES_STATUS_LABEL, labelFor } from "@/lib/status-labels";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import { isMeetingType, meetingTypeUiLabelTri } from "@/lib/meeting-types";
import { formatMytDateTime } from "@/lib/history";
import { isIsoDate } from "@/lib/date-input";
import { PAGE_SIZE, pageRange, pageSummary, parsePage } from "@/lib/list-page";
import { Pager } from "@/components/pager";
import { MinutesFilters } from "./filters";
import { MinutesHistoryActions } from "./history-actions";

// /minutes/history — every confirmed minutes document saved for the active
// org (Phase 7). User-scoped client: RLS decides visibility.
//
// 2026-08-28 (J review items 3+4): each card now leads with the document's
// NAME (title, migration 30), can be PRINTED (/api/minutes-pdf), shows the
// ORIGINAL PHOTOS it was read from (photo_paths → signed URLs), can be EDITED
// in place (history-actions.tsx; every edit stamps who/when), and search
// matches the name as well as the text.
export const dynamic = "force-dynamic";

/** Everything the URL is allowed to say about which minutes to show. */
type Query = { type?: string; from?: string; to?: string; q?: string; page?: string };

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

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
};

// The DB may be OLDER than the code (D8) — asking PostgREST for a column it
// does not know fails the WHOLE query, and a blank history is
// indistinguishable from "you have no minutes". So: full select first, the
// pre-migration-30 shape as the fallback rung.
const SELECT_FULL =
  "id, meeting_type, meeting_type_label, meeting_date, status, confirmed_by, confirmed_at, final_md, title, edited_at, edited_by, photo_paths";
const SELECT_BASE =
  "id, meeting_type, meeting_date, status, confirmed_by, confirmed_at, final_md";

export default async function MinutesHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const sp = await searchParams;
  const active = await getActiveOrg();

  // Every filter is validated before it reaches the query — an unparseable
  // date makes the whole query 400 and the page go blank.
  const typeRaw = one(sp.type);
  const type = isMeetingType(typeRaw) ? typeRaw : "";
  const fromRaw = one(sp.from);
  const from = isIsoDate(fromRaw) ? fromRaw : "";
  const toRaw = one(sp.to);
  const to = isIsoDate(toRaw) ? toRaw : "";
  const q = one(sp.q).trim().slice(0, 120);
  const page = parsePage(sp.page);
  const filters = { type, from, to, q };
  const anyFilter = Boolean(type || from || to || q);

  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <h2 className="mb-4 text-2xl font-semibold tracking-tight">
          <Tri bm="Sejarah Minit" zh="会议记录历史" en="Minutes History" />
        </h2>
        <p className="text-muted-foreground">
          <Link href="/orgs" className="underline">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建组织"
              en="Choose or create an organisation first"
            />
          </Link>
        </p>
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  const { from: rangeFrom, to: rangeTo } = pageRange(page);

  const runQuery = (select: string, titleSearchable: boolean) => {
    let query = supabase
      .from("minutes_docs")
      // `count: "exact"` on the SAME filtered query, so the number under the
      // list is the number of things the list is showing part of.
      .select(select, { count: "exact" })
      .eq("org_id", active.id);
    if (type) query = query.eq("meeting_type", type);
    if (from) query = query.gte("meeting_date", from);
    if (to) query = query.lte("meeting_date", to);
    if (q) {
      if (titleSearchable) {
        // The or() syntax uses commas/parens as its own separators — strip
        // them from the needle rather than let a typed comma 400 the page.
        const safe = q.replace(/[,()"]/g, " ").trim();
        if (safe !== "") {
          query = query.or(`final_md.ilike.%${safe}%,title.ilike.%${safe}%`);
        }
      } else {
        // The words somebody remembers are in the document, not the metadata.
        query = query.ilike("final_md", `%${q}%`);
      }
    }
    return query.order("id", { ascending: false }).range(rangeFrom, rangeTo);
  };

  let { data: docs, count, error } = await runQuery(SELECT_FULL, true);
  if (error) {
    const retry = await runQuery(SELECT_BASE, false);
    docs = retry.data;
    count = retry.count;
    error = retry.error;
  }

  const rows: Row[] = (docs ?? []) as unknown as Row[];
  const summary = pageSummary(count ?? 0, page, rows.length, PAGE_SIZE);

  // J item 4: the handwriting behind each saved document — short-lived signed
  // links into the private uploads bucket, same idiom as /inbox.
  const photosByDoc = new Map<number, { path: string; url: string }[]>();
  for (const d of rows) {
    const paths = Array.isArray(d.photo_paths)
      ? (d.photo_paths as unknown[]).filter(
          (p): p is string => typeof p === "string" && p !== "",
        )
      : [];
    if (paths.length === 0) continue;
    const signed = await Promise.all(
      paths.slice(0, 8).map(async (path) => {
        const { data } = await supabase.storage
          .from("uploads")
          .createSignedUrl(path, 3600);
        return data?.signedUrl ? { path, url: data.signedUrl } : null;
      }),
    );
    const ok = signed.filter((s): s is { path: string; url: string } => s !== null);
    if (ok.length > 0) photosByDoc.set(d.id, ok);
  }

  return (
    <div className="mx-auto w-full max-w-5xl pb-10">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          <Tri bm="Sejarah Minit" zh="会议记录历史" en="Minutes History" />
        </h2>
      </div>

      <MinutesFilters type={type} from={from} to={to} q={q} active={anyFilter} />

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            {anyFilter ? (
              <>
                {/* "Nothing matches" and "you have nothing" look identical on
                    screen and mean completely different things. */}
                <CardTitle className="text-base">
                  <Tri
                    bm="Tiada minit yang sepadan"
                    zh="没有符合条件的会议记录"
                    en="No minutes match that"
                  />
                </CardTitle>
                <CardDescription>
                  <Tri
                    bm="Cuba longgarkan tarikh, atau tekan Kosongkan untuk melihat semuanya."
                    zh="可以把日期放宽一点，或者按「清掉条件」看全部。"
                    en="Try widening the dates, or tap Clear to see everything."
                  />
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-base">
                  <Tri bm="Belum ada minit disimpan" zh="还没有保存的会议记录" en="No minutes saved yet" />
                </CardTitle>
                <CardDescription>
                  <Tri
                    bm='Sahkan medan di MinitAI, tekan "Simpan ke Sejarah"'
                    zh="在会议记录页确认字段后，点「保存到历史」"
                    en='Confirm the fields on Minutes, press "Save to History"'
                  />
                </CardDescription>
              </>
            )}
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((d) => {
            const title = (d.title ?? "").trim();
            const photos = photosByDoc.get(d.id) ?? [];
            return (
              // id anchor: the activity calendar deep-links to #minutes-N
              <Card key={d.id} id={`minutes-${d.id}`} className="scroll-mt-24 target:border-amber-400">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {/* J item 3: the document's own NAME leads; the type +
                            date drop to the line below. Untitled (older) rows
                            keep exactly what they showed before. */}
                        {title !== "" ? (
                          title
                        ) : (
                          <>
                            <Tri
                              {...meetingTypeUiLabelTri(
                                d.meeting_type ?? "",
                                d.meeting_type_label,
                              )}
                            />
                            {d.meeting_date ? ` — ${d.meeting_date}` : ""}
                          </>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {title !== "" && (
                          <>
                            <Tri
                              {...meetingTypeUiLabelTri(
                                d.meeting_type ?? "",
                                d.meeting_type_label,
                              )}
                            />
                            {d.meeting_date ? ` — ${d.meeting_date}` : ""}
                            {" · "}
                          </>
                        )}
                        <Tri bm="Disahkan oleh" zh="确认人" en="Confirmed by" />{" "}
                        {d.confirmed_by ?? "—"}
                        {d.confirmed_at ? ` · ${formatMytDateTime(d.confirmed_at)}` : ""}
                        {/* J item 4: when a saved document was corrected, the
                            list says so — same fact as the in-document line. */}
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
                <CardContent>
                  <details>
                    <summary className="cursor-pointer text-sm underline underline-offset-4">
                      <Tri bm="Lihat kandungan" zh="查看内容" en="View contents" />
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm">
                      {d.final_md}
                    </pre>
                  </details>
                  {/* J item 4: the handwriting this document was read from —
                      tap to open full size (signed link, 1 hour). Older rows
                      (or typed meetings) simply have none; /inbox keeps every
                      photo ever taken either way. */}
                  {photos.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      <p className="text-sm font-medium text-muted-foreground">
                        <Tri
                          bm="Gambar asal mesyuarat ini"
                          zh="这场会议的原始照片"
                          en="This meeting's original photos"
                        />
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {photos.map((p, i) => (
                          <a
                            key={p.path}
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded-sm border hover:opacity-80"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.url}
                              alt={`Gambar asal ${i + 1}`}
                              className="h-20 w-20 object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  <MinutesHistoryActions docId={d.id} finalMd={d.final_md} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pager
        summary={summary}
        basePath="/minutes/history"
        params={filters}
        nounBm="minit"
        nounZh="份会议记录"
        nounEn="minutes"
      />
    </div>
  );
}
