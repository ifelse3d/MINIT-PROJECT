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
import { meetingTypeLabelTri } from "@/lib/meeting-types";

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

export default async function MinutesHistoryPage() {
  const active = await getActiveOrg();

  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
        <h1 className="mb-4 text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Sejarah Minit" zh="会议记录历史" en="Minutes History" />
          </span>
        </h1>
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
  const { data: docs } = await supabase
    .from("minutes_docs")
    .select("id, meeting_type, meeting_date, status, confirmed_by, confirmed_at, final_md")
    .eq("org_id", active.id)
    .order("id", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto w-full max-w-3xl pb-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Sejarah Minit" zh="会议记录历史" en="Minutes History" />
            </span>
          </h1>
          <p className="text-sm text-[color:var(--v2-text-soft)]">{active.name}</p>
        </div>
        <Link href="/minutes" className="text-sm underline underline-offset-4">
          ← <Tri bm="Kembali ke Minit" zh="返回会议记录" en="Back to Minutes" />
        </Link>
      </div>

      {(docs ?? []).length === 0 ? (
        <Card>
          <CardHeader>
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
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {(docs ?? []).map((d) => (
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
    </div>
  );
}
