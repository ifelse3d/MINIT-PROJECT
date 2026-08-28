import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { AddTermForm, ImportGlossary } from "./glossary-form";
import { GlossaryTable, type GlossaryRow } from "./glossary-table";

// /glossary — the organisation teaches Minit its own words.
//
// 2026-08-19 (user: "各社团还是什么可能有各自的专门用词。他们可以填写让 AI 知道该
// 怎样翻译，之后翻译就不会跑或出错"). The same list is given to the model when it
// READS handwriting — knowing a member is called 昶源 is what stops it settling
// on the commoner-looking 湘源 — and when it WRITES the minutes, so a class is
// not "Kelas Qing" in March and 青班 in April.
//
// Laid out the same way as /members after the same feedback ("為什麼那麼窄…看起來
// 也很亂"): full width, one card, the form is a row inside the card it feeds.

export const dynamic = "force-dynamic";

type Row = GlossaryRow;

export default async function GlossaryPage() {
  const [user, active] = await Promise.all([getSessionUser(), getActiveOrg()]);

  let rows: Row[] = [];
  let dbBehind = false;
  if (user && active) {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
      .from("org_glossary")
      .select("id, term, action, translation, note, lang, render_bm, render_zh, render_en")
      .eq("org_id", active.id)
      .order("id", { ascending: true });
    if (!error && data) {
      rows = data as Row[];
    } else {
      // Pre-28 database: the trilingual columns are not there yet.
      dbBehind = true;
      const legacy = await supabase
        .from("org_glossary")
        .select("id, term, action, translation, note")
        .eq("org_id", active.id)
        .order("id", { ascending: true });
      rows = (legacy.data ?? []) as Row[];
    }
  }

  // B-4: matches the server action's own check (minutes_write) — the UI is
  // never the authority, but it must not offer a form the server will refuse.
  const canEdit = active !== null && can(active.role, "minutes_write");

  return (
    <div className="mx-auto w-full max-w-5xl pb-10">
      <div className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Perkataan Kami" zh="我们的词库" en="Our Words" />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Ajar MinitAI sekali — ia membaca lebih tepat dan menulis sama setiap kali."
            zh="教 MinitAI 一次 —— 读的时候不容易认错，写出来每次都一样。"
            en="Teach MinitAI once — it reads them more accurately and writes them the same way every time."
          />
        </p>
      </div>

      {!active ? (
        <Card>
          <CardContent className="pt-6 text-base">
            <Tri
              bm="Pilih pertubuhan dahulu."
              zh="请先选择一个机构。"
              en="Choose an organisation first."
            />{" "}
            <Link href="/orgs" className="underline underline-offset-4">
              <Tri bm="Pertubuhan" zh="机构" en="Organisations" /> →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                <Tri
                  bm={`Senarai ${active.name}`}
                  zh={`${active.name} 的词库`}
                  en={`${active.name}'s list`}
                />
              </CardTitle>
              <Badge variant="secondary">
                {rows.length} <Tri bm="perkataan" zh="个词" en="words" />
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {/* B-3 (work order 51): the FORM on top, the list below it. */}
            {canEdit && (
              <>
                <AddTermForm />
                <ImportGlossary />
              </>
            )}
            <div className={canEdit ? "border-t border-border pt-5" : undefined}>
              {/* #10: one row = the original word (in ITS language) and how
                  the other two languages say it. No renderings anywhere =
                  the word is kept exactly, never translated (B-10 wording).
                  Search + pages live in the table component. */}
              <GlossaryTable rows={rows} canEdit={canEdit} />
            </div>

            {dbBehind && (
              <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <Tri
                  bm="Lajur tiga bahasa menunggu kemas kini pangkalan data 28. Entri baharu masih disimpan (bentuk lama) — tiada apa-apa hilang."
                  zh="三语栏位在等数据库更新 28。新加的词还是会存起来（旧格式）—— 不会丢东西。"
                  en="The trilingual columns are waiting for database update 28. New entries still save (legacy shape) — nothing is lost."
                />
              </p>
            )}

          </CardContent>
        </Card>
      )}
    </div>
  );
}
