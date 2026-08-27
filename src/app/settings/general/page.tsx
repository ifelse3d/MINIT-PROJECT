import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { SettingsRow, SettingsSection } from "../ui";

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
    </div>
  );
}
