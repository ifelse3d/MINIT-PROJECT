import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { getSupabaseServer } from "@/db/supabase-server";
import { can } from "@/lib/roles";
import { SettingsRow, SettingsSection } from "../ui";
import {
  MaklumatAmCard,
  type BankAccountRow,
  type MaklumatAmValues,
} from "../maklumat-am-card";

// /settings/general — the organisation's identity + tax status (§7.2b).
export const dynamic = "force-dynamic";

const TAX_LABEL: Record<string, { bm: string; zh: string; en: string }> = {
  none: { bm: "Tiada", zh: "无", en: "None" },
  s44_6: {
    bm: "Diluluskan s.44(6)",
    zh: "已获 s.44(6) 批准",
    en: "Approved s.44(6)",
  },
  pure_religious: {
    bm: "Keagamaan semata-mata",
    zh: "纯宗教用途",
    en: "Pure religious",
  },
};

export default async function GeneralSettingsPage() {
  const active = await getActiveOrg();

  // D2-2 (work order 56): the eROSES Maklumat Am fields. RECORDED values come
  // from migration 35's columns (fail-open: a database that is behind answers
  // with an unknown-column error and the card says "not stored yet");
  // DERIVED counts come from what already exists — the committee roster and
  // the org tree — and are shown read-only, never asked for twice.
  let maklumat: MaklumatAmValues = {
    phone: "",
    financialYearStart: "",
    membersRegistered: "",
    membersVoting: "",
  };
  let banks: BankAccountRow[] = [];
  let maklumatDbBehind = false;
  let committeeCount = 0;
  let branchCount = 0;
  if (active) {
    const supabase = await getSupabaseServer();
    const [orgRead, bankRead, rosterRead, branchesRead] = await Promise.all([
      supabase
        .from("orgs")
        .select("phone, financial_year_start, members_registered, members_voting")
        .eq("id", active.id)
        .maybeSingle(),
      supabase
        .from("org_bank_accounts")
        .select("id, bank_name, account_no")
        .eq("org_id", active.id)
        .order("id", { ascending: true }),
      supabase
        .from("committee_roster")
        .select("id", { count: "exact", head: true })
        .eq("org_id", active.id),
      supabase
        .from("orgs")
        .select("id", { count: "exact", head: true })
        .eq("parent_org_id", active.id),
    ]);
    if (!orgRead.error && orgRead.data) {
      maklumat = {
        phone: orgRead.data.phone ?? "",
        financialYearStart: orgRead.data.financial_year_start ?? "",
        membersRegistered:
          orgRead.data.members_registered === null ||
          orgRead.data.members_registered === undefined
            ? ""
            : String(orgRead.data.members_registered),
        membersVoting:
          orgRead.data.members_voting === null ||
          orgRead.data.members_voting === undefined
            ? ""
            : String(orgRead.data.members_voting),
      };
    } else if (orgRead.error) {
      maklumatDbBehind = true;
    }
    if (!bankRead.error && bankRead.data) banks = bankRead.data as BankAccountRow[];
    committeeCount = rosterRead.count ?? 0;
    branchCount = branchesRead.count ?? 0;
  }
  const canManage = active !== null && can(active.role, "manage_org");

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Pertubuhan" zh="机构" en="Organisation" />
      </h1>
      <SettingsSection title={<Tri bm="Identiti" zh="身份" en="Identity" />}>
        <SettingsRow
          label={<Tri bm="Pertubuhan aktif" zh="当前机构" en="Active organisation" />}
          help={
            <Tri
              bm="Nama ini dicetak pada setiap resit, minit dan dokumen rasmi yang MinitAI hasilkan untuk anda."
              zh="这个名字会印在 MinitAI 帮您做的每一张收据、每一份会议记录和每一份官方文件上。"
              en="This name is printed on every receipt, minutes document and official document MinitAI makes for you."
            />
          }
        >
          {active ? (
            <div className="flex flex-col gap-2">
              <p className="flex flex-wrap items-center gap-2 text-base font-medium">
                {active.name}
                {active.isDemo && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                    DEMO
                  </Badge>
                )}
                {active.role && (
                  <span className="text-sm font-normal text-muted-foreground">
                    <Tri {...labelFor(ROLE_LABEL, active.role)} />
                  </span>
                )}
              </p>
              <Link href="/orgs" className="w-fit text-base underline underline-offset-4">
                <Tri
                  bm="Tukar pertubuhan, atau tambah cawangan"
                  zh="切换机构，或添加分会"
                  en="Switch organisation, or add a branch"
                />{" "}
                →
              </Link>
            </div>
          ) : (
            <Link href="/orgs" className="text-base underline underline-offset-4">
              <Tri
                bm="Pilih atau cipta pertubuhan dahulu"
                zh="请先选择或创建组织"
                en="Choose or create an organisation first"
              />{" "}
              →
            </Link>
          )}
        </SettingsRow>

        {active && (
          <SettingsRow
            label={<Tri bm="Status cukai" zh="税务状态" en="Tax status" />}
            sub={
              <Tri
                bm="Tidak boleh ditukar sendiri"
                zh="不能自己更改"
                en="Cannot be changed here"
              />
            }
          >
            <div className="flex flex-col gap-2">
              <p className="text-base font-medium">
                {TAX_LABEL[active.taxExemptStatus] ? (
                  <Tri {...TAX_LABEL[active.taxExemptStatus]} />
                ) : (
                  active.taxExemptStatus
                )}
              </p>
              {active.taxExemptStatus === "none" && (
                <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm font-medium leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                  ⚠{" "}
                  <Tri
                    bm="Tiada status s.44(6), jadi resit anda TIDAK boleh menyebut pelepasan cukai — dan MinitAI tidak akan mencetaknya. s.44(6) ialah kelulusan LHDN yang mesti diluluskan dahulu."
                    zh="没有 s.44(6) 身份，所以您的收据不可以写「可扣税」—— MinitAI 也不会印上去。s.44(6) 是税务局（LHDN）的批准，必须先获批。"
                    en="No s.44(6) status, so your receipts must NOT mention tax relief — and MinitAI will not print it. s.44(6) is an LHDN approval that has to be granted first."
                  />
                </p>
              )}
            </div>
          </SettingsRow>
        )}
      </SettingsSection>

      {/* D2-2: what eROSES Penyata Tahunan step 2 (Maklumat Am) asks for. */}
      {active && (
        <SettingsSection
          title={<Tri bm="Maklumat Am (eROSES)" zh="基本资料（eROSES）" en="Maklumat Am (eROSES)" />}
        >
          <SettingsRow
            label={
              <Tri
                bm="Untuk Penyata Tahunan"
                zh="年度呈报要用的资料"
                en="For the Annual Return"
              />
            }
            help={
              <Tri
                bm="eROSES langkah 2 minta nilai-nilai ini. Dua nombor lain dikira sendiri daripada rekod anda: pemegang jawatan ikut Senarai AJK, cawangan ikut pokok pertubuhan."
                zh="eROSES 第 2 步会要这些资料。另外两个数字系统自己算：职位数照理事名单，分会数照机构树。"
                en="eROSES step 2 asks for these. Two more numbers are derived from your records: office bearers from the committee list, branches from the organisation tree."
              />
            }
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm={`Dikira sendiri: pemegang jawatan ${committeeCount} orang (Senarai AJK) · cawangan ${branchCount}.`}
                  zh={`系统自己算的：职位数 ${committeeCount} 人（照理事名单）· 分会 ${branchCount} 个。`}
                  en={`Derived: ${committeeCount} office bearer(s) (from the committee list) · ${branchCount} branch(es).`}
                />
              </p>
              <MaklumatAmCard
                values={maklumat}
                banks={banks}
                canEdit={canManage}
                dbBehind={maklumatDbBehind}
              />
            </div>
          </SettingsRow>
        </SettingsSection>
      )}
    </div>
  );
}
