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
import { isMeetingType, meetingTypeLabelTri } from "@/lib/meeting-types";
import { isIsoDate } from "@/lib/date-input";
import { PAGE_SIZE, pageRange, pageSummary, parsePage } from "@/lib/list-page";
import { Pager } from "@/components/pager";
import { MinutesFilters } from "./filters";

// /minutes/history — every confirmed minutes document saved for the active
// org (Phase 7). User-scoped client: RLS decides visibility.
export const dynamic = "force-dynamic";

// The type names come from @/lib/meeting-types, the one list every screen
// reads. This page used to keep its own third copy, which is why "AGM" was
// abbreviated here and written out in full two screens away.
//
// ⚠ meeting_type_label (the society's own name for an "other" meeting) is
// deliberately NOT selected below. The column arrives with migration
// 20260820000000, and asking PostgREST for a column that does not exist yet
// fails the WHOLE query — this page would go blank on any database where the
// migration has not been pasted. It is added the day the migration is applied.

/** Everything the URL is allowed to say about which minutes to show. */
type Query = { type?: string; from?: string; to?: string; q?: string; page?: string };

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

export default async function MinutesHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const sp = await searchParams;
  const active = await getActiveOrg();

  // Every filter is validated before it reaches the query. `type` must be a
  // known meeting type and the dates must be real ISO days — not because
  // PostgREST would be injectable (it is parameterised), but because an
  // unparseable date makes the whole query 400 and the page go blank, and a
  // blank history is indistinguishable from "you have no minutes".
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
  let query = supabase
    .from("minutes_docs")
    // `count: "exact"` on the SAME filtered query, so the number under the list
    // is the number of things the list is showing part of — not the length of
    // the array we happen to be holding, which is the bug this replaces.
    .select("id, meeting_type, meeting_date, status, confirmed_by, confirmed_at, final_md", {
      count: "exact",
    })
    .eq("org_id", active.id);
  if (type) query = query.eq("meeting_type", type);
  if (from) query = query.gte("meeting_date", from);
  if (to) query = query.lte("meeting_date", to);
  // The words somebody remembers are in the document, not in the metadata:
  // "the meeting where we agreed the new premises".
  if (q) query = query.ilike("final_md", `%${q}%`);
  const { data: docs, count } = await query
    .order("id", { ascending: false })
    .range(rangeFrom, rangeTo);

  const rows = docs ?? [];
  const summary = pageSummary(count ?? 0, page, rows.length, PAGE_SIZE);

  return (
    // F-1 (2026-08-25): list/table content fills the section's width — the
    // 3xl cap squeezed the rows while the rail above sat wider.
    <div className="mx-auto w-full max-w-5xl pb-10">
      {/* h2 and no back link — the /minutes layout above already carries the
          section heading, the organisation and the tab rail. (2026-08-23.) */}
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
                    bm='Sahkan medan di Minit, tekan "Simpan ke Sejarah"'
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
          {rows.map((d) => (
            // id anchor: the activity calendar deep-links to #minutes-N
            <Card key={d.id} id={`minutes-${d.id}`} className="scroll-mt-24 target:border-amber-400">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      <Tri {...meetingTypeLabelTri(d.meeting_type ?? "")} />
                      {d.meeting_date ? ` — ${d.meeting_date}` : ""}
                    </CardTitle>
                    <CardDescription>
                      <Tri bm="Disahkan oleh" zh="确认人" en="Confirmed by" />{" "}
                      {d.confirmed_by ?? "—"}
                      {d.confirmed_at
                        ? ` · ${new Date(d.confirmed_at).toLocaleString("ms-MY")}`
                        : ""}
                    </CardDescription>
                  </div>
                  <Badge className="bg-green-600 text-white hover:bg-green-600">
                    {/* Was the raw enum "confirmed". */}
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
              </CardContent>
            </Card>
          ))}
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
