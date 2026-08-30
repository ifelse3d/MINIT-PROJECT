import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupsCard } from "./groups-card";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { AddCommitteeRow, ImportCommittee } from "./members-form";
import {
  CommitteeTable,
  ErosesGapsBanner,
  type CommitteeRow,
} from "./committee-table";
import { AuditorsCard, type AuditorRow } from "./auditors-card";
import { PositionsTemplate, type RequirementLine } from "./positions-template";
import { loadConstitutionClauses } from "@/app/constitution/actions";
import {
  committeeRequirementFromClauses,
  countRosterAgainstRequirement,
} from "@/lib/constitution-committee";

// /members — who is in this society, and in what capacity.
//
// 2026-08-19 (user: "我也想这个系统有一个地方可以看到成员名单，有 AJK，普通成员，
// 主席等等"). Two lists were already in the database and neither had a screen:
//
//   committee_roster — the society's OWN roster. This is what becomes "Senarai
//     Ahli Jawatankuasa" in the eROSES Annual Return, so the card says out loud
//     that a one-off duty does not belong in it.
//   members_roles — who can LOG IN and what they may do. That list now lives
//     where it is managed: Settings → Members & invites (B-8, work order 51 —
//     the tester read the two lists on one page as one confusing list).
//
// B-3 (work order 51): the FORM sits on top, the list below it, and the list
// is a searchable table. B-1 (拍板 5): the "term ended / former" machinery is
// gone — a committee change is a Mesyuarat Agung decision, and eROSES only
// asks for the APPOINTMENT date.

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const [user, active] = await Promise.all([getSessionUser(), getActiveOrg()]);

  let committee: CommitteeRow[] = [];
  // D2-1: the Juruaudit roster (migration 34). A database that is behind
  // answers with an unknown-table error — the card then shows an honest
  // "not stored yet" line instead of white-screening (fail-open, D8).
  let auditors: AuditorRow[] = [];
  let auditorsDbBehind = false;
  if (user && active) {
    const supabase = await getSupabaseServer();
    // Newest columns first; a database that is behind (D8) answers with an
    // unknown-column error, and the select retries one migration back per
    // step (41 → 37 → 32 → base) — the page never white-screens over a
    // schema gap.
    const with41 = await supabase
      .from("committee_roster")
      .select(
        "id, position, person_name, name_official, term_start, note, honorific, email, state, phone",
      )
      .eq("org_id", active.id)
      .order("id", { ascending: true });
    const with37 = with41.error
      ? await supabase
          .from("committee_roster")
          .select(
            "id, position, person_name, name_official, term_start, note, honorific, email, state",
          )
          .eq("org_id", active.id)
          .order("id", { ascending: true })
      : with41;
    if (!with37.error && with37.data) {
      committee = with37.data as CommitteeRow[];
    } else {
      const with32 = await supabase
        .from("committee_roster")
        .select(
          "id, position, person_name, name_official, term_start, note, honorific",
        )
        .eq("org_id", active.id)
        .order("id", { ascending: true });
      if (!with32.error && with32.data) {
        committee = with32.data as CommitteeRow[];
      } else {
        const legacy = await supabase
          .from("committee_roster")
          .select("id, position, person_name, name_official, term_start")
          .eq("org_id", active.id)
          .order("id", { ascending: true });
        committee = (legacy.data ?? []) as CommitteeRow[];
      }
    }

    const auditorsRead = await supabase
      .from("auditors")
      .select("id, person_name, name_official, email, appointed_on, status")
      .eq("org_id", active.id)
      .order("id", { ascending: true });
    if (!auditorsRead.error && auditorsRead.data) {
      auditors = auditorsRead.data as AuditorRow[];
    } else if (auditorsRead.error) {
      auditorsDbBehind = true;
    }
  }

  // Matches the server action's own check (minutes_write) — the UI is
  // never the authority, but it must not offer a form the server will refuse.
  const canEdit = active !== null && can(active.role, "minutes_write");

  // H1 (§1-5): what the constitution says the committee looks like — parsed
  // by code from the clauses the human already confirmed, never by AI, and
  // only shown when the classic composition sentence parses cleanly.
  let templatePositions: { position: string; count: number }[] | null = null;
  let requirementLines: RequirementLine[] | null = null;
  let requirementClause: string | null = null;
  if (canEdit) {
    const clauses = await loadConstitutionClauses();
    const requirement = committeeRequirementFromClauses(clauses);
    if (requirement) {
      templatePositions = requirement.positions.map((p) => ({
        position: p.title,
        count: p.count,
      }));
      requirementLines = countRosterAgainstRequirement(
        requirement,
        committee.map((m) => m.position),
      );
      requirementClause = requirement.clauseNo;
    }
  }

  // D48 (⑦, work order 89 — J 8/30 night, 「都要」): the 2026-08-19 ruling
  // "bite at the filing, not at the adding" is REVERSED. The add/edit form
  // now refuses a row missing what eROSES requires (IC name, state,
  // appointment date), and the penyata flow's AJK step refuses the copy-pack
  // over the same gaps. The risk the old ruling guarded — someone inventing
  // a romanisation on the spot because the form demands an IC name — is
  // real (the 68-session precedent) and is answered by the standing warning
  // beside the box, never by loosening the gate. Rows that ALREADY have
  // gaps (history, roster photos, imports) keep them: painted amber in the
  // table with the gaps named, jumped to by the banner below.

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
            bm="Senarai jawatankuasa yang difailkan, dan kumpulan pertubuhan anda sendiri."
            zh="要申报的理事名单，还有你们自己的分组。"
            en="The committee you file, and your society's own groups."
          />
        </p>
        {/* 100 §5: "Members & invites" left the settings menu (tucked away) —
            this row is its door. Invite codes and sign-ins keep working. */}
        {canEdit && (
          <p className="text-base text-muted-foreground">
            🔑{" "}
            <Link href="/settings/members" className="underline underline-offset-4">
              <Tri
                bm="Kod jemputan & siapa boleh log masuk"
                zh="邀请码与登录成员"
                en="Invite codes & who can sign in"
              />{" "}
              →
            </Link>
          </p>
        )}
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
          {/* D48: every eROSES gap counted, one tap scrolls to the first
              gapped row. Renders nothing when the list is complete. */}
          <ErosesGapsBanner rows={committee} />

          {/* 1 — the filed committee. Form on top, table below (B-3). */}
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
                {/* B-11: SAY what the number counts — "0 people" above a
                    visible list read as a bug to the tester. */}
                <Badge variant="secondary">
                  <Tri
                    bm={`Semasa: ${committee.length} orang`}
                    zh={`现任 ${committee.length} 人`}
                    en={`Current: ${committee.length}`}
                  />
                </Badge>
              </div>
              <p className="rounded-sm border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <Tri
                  bm="Senarai ini masuk ke eROSES (Penyata Tahunan). Jawatan tetap pertubuhan sahaja — tugas untuk satu aktiviti BUKAN jawatan jawatankuasa."
                  zh="这份名单会进 eROSES（年度申报）。只放常设职位 —— 某一个活动的分工不是理事职位。"
                  en="This list goes into eROSES (the Annual Return). Standing positions only — a duty for one activity is NOT a committee position."
                />
              </p>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              {canEdit && (
                <>
                  <PositionsTemplate
                    requirement={templatePositions}
                    requirementLines={requirementLines}
                    clauseNo={requirementClause}
                    rosterEmpty={committee.length === 0}
                  />
                  <AddCommitteeRow />
                  <ImportCommittee />
                </>
              )}
              <div className={canEdit ? "border-t border-border pt-5" : undefined}>
                <CommitteeTable rows={committee} canEdit={canEdit} />
              </div>
            </CardContent>
          </Card>

          {/* 2 — the Juruaudit roster (D2-1, work order 56): what eROSES
              Penyata Tahunan step 4 files, with its "active count must match
              the constitution" rule said out loud. */}
          <Card>
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  <Tri bm="Senarai Juruaudit" zh="审计员名单" en="Auditors" />
                </CardTitle>
                <Badge variant="secondary">
                  <Tri
                    bm={`Aktif: ${auditors.filter((a) => a.status === "active").length} orang`}
                    zh={`现任 ${auditors.filter((a) => a.status === "active").length} 人`}
                    en={`Active: ${auditors.filter((a) => a.status === "active").length}`}
                  />
                </Badge>
              </div>
              <p className="rounded-sm border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <Tri
                  bm="Senarai ini masuk ke eROSES (Penyata Tahunan langkah 4). Bilangan juruaudit AKTIF mesti ikut perlembagaan pertubuhan anda — eROSES menyemaknya."
                  zh="这份名单会进 eROSES（年度呈报第 4 步）。现任审计员的人数要照你们的章程 —— eROSES 会核对。"
                  en="This list goes into eROSES (Annual Return step 4). The number of ACTIVE auditors must follow your constitution — eROSES checks it."
                />
              </p>
            </CardHeader>
            <CardContent>
              <AuditorsCard
                rows={auditors}
                canEdit={canEdit}
                dbBehind={auditorsDbBehind}
              />
            </CardContent>
          </Card>

          {/* 3 — the society's OWN groupings. Not a filing; see groups-card.tsx. */}
          <Card>
            <CardHeader className="gap-2">
              <CardTitle>
                <Tri bm="Kumpulan anda" zh="你们自己的分组" en="Your own groups" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GroupsCard
                canEdit={canEdit}
                committeeNames={[
                  ...new Set(
                    committee
                      .map((m) => (m.person_name ?? "").trim())
                      .filter((n) => n !== ""),
                  ),
                ]}
              />
            </CardContent>
          </Card>

          {/* §1-9 (work order 69, J's decision): the "who can log in" pointer
              line is GONE — Settings → Members & invites manages accounts and
              this page stopped mentioning them. */}
        </div>
      )}
    </div>
  );
}
