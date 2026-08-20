import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { AddCommitteeRow, ImportCommittee, RemoveCommitteeButton } from "./members-form";

// /members — who is in this society, and in what capacity.
//
// 2026-08-19 (user: "我也想这个系统有一个地方可以看到成员名单，有 AJK，普通成员，
// 主席等等"). Two lists were already in the database and neither had a screen:
//
//   committee_roster — the society's OWN roster. This is what becomes "Senarai
//     Ahli Jawatankuasa" in the eROSES Annual Return, so the card says out loud
//     that a one-off duty does not belong in it. One of the 11 tables no code
//     had ever written to.
//   members_roles — who can LOG IN and what they may do. A treasurer with no
//     account is still on the committee; conflating the two is how a system
//     ends up filing its user list to the Registrar.
//
// Second pass the same afternoon, after the user saw it: "為什麼那麼窄，明明還有
// 很多地方。然後看起來也很亂。" Both were fair. It was max-w-2xl on a page whose
// content is tabular (every other working screen is max-w-5xl), and the add
// form sat in its own card below the list, so a page with two lists read as a
// page with four panels. Now: one card per list, the form is a row inside the
// card it feeds, and the data is an actual table.

export const dynamic = "force-dynamic";

type Committee = {
  id: number;
  position: string;
  person_name: string;
  name_official: string | null;
  term_start: string | null;
  term_end: string | null;
};

type AppUser = { id: number; name: string; role: string };

export default async function MembersPage() {
  const [user, active] = await Promise.all([getSessionUser(), getActiveOrg()]);

  let committee: Committee[] = [];
  let users: AppUser[] = [];
  if (user && active) {
    const supabase = await getSupabaseServer();
    const [c, u] = await Promise.all([
      supabase
        .from("committee_roster")
        .select("id, position, person_name, name_official, term_start, term_end")
        .eq("org_id", active.id)
        .order("id", { ascending: true }),
      supabase
        .from("members_roles")
        .select("id, name, role")
        .eq("org_id", active.id)
        .order("id", { ascending: true }),
    ]);
    committee = (c.data ?? []) as Committee[];
    users = (u.data ?? []) as AppUser[];
  }

  const canEdit = active !== null && active.role !== "auditor_readonly";

  // How many of the filed committee still have no name as printed on their IC.
  //
  // 2026-08-19, J's decision, written down so nobody quietly reverses it:
  // THE RULE BITES AT THE FILING, NOT AT THE ADDING. A secretary usually has
  // only the Chinese name to hand and has to ask the person for the IC — if
  // adding someone were blocked on it, they could not even write the name
  // down, so they would invent a romanisation, and an invented romanisation on
  // a government form is a false filing. That is the exact thing being
  // prevented. So: never in the way while the list is being built, and counted
  // in plain sight because eROSES will ask.
  const missingOfficial = committee.filter(
    (m) => (m.name_official ?? "").trim() === "",
  ).length;

  return (
    <div className="mx-auto w-full max-w-5xl pb-10">
      <div className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Ahli & Jawatankuasa" zh="成员与理事" en="Members & Committee" />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Dua senarai berbeza: jawatankuasa yang difailkan, dan siapa yang boleh log masuk."
            zh="两份不一样的名单：要申报的理事名单，还有谁可以登入。"
            en="Two different lists: the committee you file, and who can log in."
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
        <div className="flex flex-col gap-6">
          {/* Counted, not enforced. Nothing here blocks anything — it is the
              one number the secretary needs before opening eROSES, and it
              disappears the moment it reaches zero. */}
          {missingOfficial > 0 && (
            <p className="rounded-xl border-2 border-amber-300 bg-amber-50/80 p-3 text-base font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
              ⚠{" "}
              <Tri
                bm={`${missingOfficial} orang belum ada nama seperti dalam kad pengenalan. eROSES memerlukannya — salin daripada IC mereka, jangan terjemah sendiri.`}
                zh={`${missingOfficial} 人还没填身份证上的名字。eROSES 申报前要补齐 —— 请照他们的身份证抄，不要自己音译。`}
                en={`${missingOfficial} ${missingOfficial === 1 ? "person has" : "people have"} no name as printed on their identity card. eROSES needs it — copy it from their IC rather than transliterating it yourself.`}
              />
            </p>
          )}

          {/* 1 — the filed committee */}
          <Card>
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  <Tri
                    bm="Senarai Ahli Jawatankuasa"
                    zh="理事名单"
                    en="Committee list"
                  />
                </CardTitle>
                <Badge variant="secondary">
                  {committee.length}{" "}
                  <Tri bm="orang" zh="人" en="people" />
                </Badge>
              </div>
              <p className="rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <Tri
                  bm="Senarai ini masuk ke eROSES (Penyata Tahunan). Jawatan tetap pertubuhan sahaja — tugas untuk satu aktiviti BUKAN jawatan jawatankuasa."
                  zh="这份名单会进 eROSES（年度申报）。只放常设职位 —— 某一个活动的分工不是理事职位。"
                  en="This list goes into eROSES (the Annual Return). Standing positions only — a duty for one activity is NOT a committee position."
                />
              </p>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              {committee.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  <Tri
                    bm="Masih kosong — tambah seorang di bawah, atau tampal senarai sedia ada."
                    zh="还是空的 —— 在下面加一位，或者把已经有的名单贴进来。"
                    en="Still empty — add someone below, or paste a list you already have."
                  />
                </p>
              ) : (
                <div className="-mx-2 overflow-x-auto">
                  <table className="w-full min-w-[44rem] border-collapse text-base">
                    <thead>
                      <tr className="border-b border-border text-left text-sm text-muted-foreground">
                        <th className="px-2 py-2 font-medium">
                          <Tri bm="Jawatan" zh="职位" en="Position" />
                        </th>
                        <th className="px-2 py-2 font-medium">
                          <Tri bm="Nama" zh="姓名" en="Name" />
                        </th>
                        <th className="px-2 py-2 font-medium">
                          <Tri
                            bm="Nama dalam IC (eROSES)"
                            zh="身份证上的名字（eROSES）"
                            en="Name on IC (eROSES)"
                          />
                        </th>
                        <th className="px-2 py-2 font-medium">
                          <Tri bm="Penggal" zh="任期" en="Term" />
                        </th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {committee.map((m) => (
                        <tr key={m.id} className="border-b border-border/60 last:border-0">
                          <td className="px-2 py-3 align-top">{m.position}</td>
                          <td className="px-2 py-3 align-top font-semibold">
                            {m.person_name}
                          </td>
                          <td className="px-2 py-3 align-top">
                            {/* Amber, not grey: this is the same gap the
                                banner above counts, so it has to be findable
                                by eye once you have read the number. Empty
                                string counts as missing too — the roster
                                import writes "" where a photo showed no IC
                                name, and a blank that reads as "filled in"
                                is the whole problem. */}
                            {(m.name_official ?? "").trim() !== "" ? (
                              m.name_official
                            ) : (
                              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                <Tri bm="belum diisi" zh="还没填" en="not filled in" />
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-3 align-top text-sm text-muted-foreground">
                            {m.term_start || m.term_end
                              ? `${m.term_start ?? "—"} → ${m.term_end ?? "—"}`
                              : "—"}
                          </td>
                          <td className="px-2 py-3 text-right align-top">
                            {canEdit && <RemoveCommitteeButton id={m.id} />}
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
                    <AddCommitteeRow />
                  </div>
                  <ImportCommittee />
                </>
              )}
            </CardContent>
          </Card>

          {/* 2 — who can log in. A different question entirely. */}
          <Card>
            <CardHeader className="gap-2">
              <CardTitle>
                <Tri bm="Siapa boleh guna Minit" zh="谁可以用 Minit" en="Who can use Minit" />
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Akaun dan kebenaran. Ini bukan senarai yang difailkan — seorang bendahari tanpa akaun masih ahli jawatankuasa."
                  zh="这是登入帐号和权限，不是要申报的名单 —— 没有帐号的财政，还是理事。"
                  en="Accounts and permissions. This is not the filed list — a treasurer without an account is still on the committee."
                />
              </p>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  <Tri
                    bm="Tiada akaun lain buat masa ini."
                    zh="目前只有您一个人。"
                    en="No other accounts yet."
                  />
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                  {users.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <span className="text-base font-semibold">{m.name}</span>
                      <span className="text-sm text-muted-foreground">
                        <Tri {...labelFor(ROLE_LABEL, m.role)} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-sm text-muted-foreground">
                <Tri
                  bm="Menjemput orang lain belum tersedia (P1-1)."
                  zh="邀请其他人加入还没做（P1-1）。"
                  en="Inviting other people is not built yet (P1-1)."
                />
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
