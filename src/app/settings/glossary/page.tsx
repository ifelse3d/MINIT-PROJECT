import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { AddTermForm, DeleteTermButton, ImportGlossary } from "./glossary-form";

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

type Row = {
  id: number;
  term: string;
  action: "keep" | "translate";
  translation: string | null;
  note: string | null;
};

export default async function GlossaryPage() {
  const [user, active] = await Promise.all([getSessionUser(), getActiveOrg()]);

  let rows: Row[] = [];
  if (user && active) {
    const supabase = await getSupabaseServer();
    const { data } = await supabase
      .from("org_glossary")
      .select("id, term, action, translation, note")
      .eq("org_id", active.id)
      .order("id", { ascending: true });
    rows = (data ?? []) as Row[];
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
            {rows.length === 0 ? (
              <p className="text-base text-muted-foreground">
                <Tri
                  bm="Masih kosong. Mulakan dengan nama ahli yang sering disalah baca, dan nama kelas atau ajaran anda."
                  zh="还是空的。可以先加最常被读错的人名，还有你们的班别、法号这类。"
                  en="Still empty. Start with the members' names that get misread most, and your class or teaching names."
                />
              </p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-base">
                  <thead>
                    <tr className="border-b border-border text-left text-sm text-muted-foreground">
                      <th className="px-2 py-2 font-medium">
                        <Tri bm="Perkataan" zh="那个词" en="The word" />
                      </th>
                      <th className="px-2 py-2 font-medium">
                        <Tri bm="Ditulis sebagai" zh="怎么处理" en="Written as" />
                      </th>
                      <th className="px-2 py-2 font-medium">
                        <Tri bm="Ia apa" zh="这是什么" en="What it is" />
                      </th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-3 align-top font-semibold">{r.term}</td>
                        <td className="px-2 py-3 align-top">
                          {r.action === "keep" ? (
                            <span className="text-muted-foreground">
                              <Tri
                                bm="kekal seperti asal"
                                zh="保持原字"
                                en="kept as written"
                              />
                            </span>
                          ) : (
                            r.translation
                          )}
                        </td>
                        <td className="px-2 py-3 align-top text-sm text-muted-foreground">
                          {r.note ?? "—"}
                        </td>
                        <td className="px-2 py-3 text-right align-top">
                          {canEdit && <DeleteTermButton id={r.id} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canEdit && (
              <>
                <div className="border-t border-border pt-5">
                  <AddTermForm />
                </div>
                <ImportGlossary />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
