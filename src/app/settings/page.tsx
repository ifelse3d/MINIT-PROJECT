import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tri } from "@/components/language-provider";
import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { dayIsoMalaysia } from "@/lib/history";
import { AiUsageRows } from "./ai-usage-rows";
import { AppearanceRows } from "./appearance-rows";
import { ChangePasswordRows } from "./change-password-rows";
import { DeleteOrgSection } from "./delete-org-section";
import { DeleteRegisterSection } from "./delete-register-section";
import { EinvoisRows } from "./einvois-rows";
import { ReceiptSeriesRows } from "./receipt-series-rows";
import { SettingsRow, SettingsSection } from "./ui";

// /settings
//
// 2026-07-28, user: "这个 setting page 感觉也没什么用处". It listed four
// read-only facts and offered one action (delete everything), so it was rebuilt
// around the things a person actually wants to change.
//
// 2026-08-22, J looking at that rebuild: "SETTING 這裏就太亂了，也複雜。"
// Also right, and for the opposite reason — every card had grown a paragraph
// that is always open, printed once PER SWITCHED-ON LANGUAGE. The page had
// become prose with controls buried in it.
//
// It is now four labelled sections of one-line rows, with every long
// explanation folded behind "Apa ini? · 这是什么？". Nothing was deleted; the
// words moved. See ./ui.tsx for the reasoning and the pieces.
//
//   Paparan       text size · background · language
//   Akaun         which account · change password
//   Pertubuhan    active org · tax status · glossary
//   Bantuan AI    the monthly meter
//   Sistem        the /health check
//   (danger)      delete organisation — hq_admin only, typed confirmation
//
// Tax-exempt status stays read-only and its warning stays visible (NOT folded):
// see supabase/migrations/20260728000000_lock_org_privileged_columns.sql. A
// legal warning that a person has to open a disclosure to find is a warning
// that was not given.
export const dynamic = "force-dynamic";

// Language parts, not pre-joined strings — so <Tri> can follow the user's
// language switcher instead of always printing BM/EN.
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

/**
 * The org's receipt letters, and whether they are still changeable.
 *
 * Two cheap reads rather than one join: the count is a HEAD request (no rows
 * come back, so no donor data crosses the wire — Hard Rule 5), and "has this
 * org ever issued a receipt" is exactly the condition
 * freeze_receipt_series() uses, so the UI and the trigger agree by construction.
 */
async function loadReceiptSeries(
  orgId: number,
): Promise<{ prefix: string; frozen: boolean } | null> {
  const supabase = await getSupabaseServer();
  const [{ data: org }, { count }] = await Promise.all([
    supabase.from("orgs").select("receipt_prefix").eq("id", orgId).maybeSingle(),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);
  if (!org) return null;
  return { prefix: org.receipt_prefix as string, frozen: (count ?? 0) > 0 };
}

export default async function SettingsPage() {
  const [user, active] = await Promise.all([getSessionUser(), getActiveOrg()]);
  const usage = active ? await getUsage(active.id) : null;
  const receiptSeries = active ? await loadReceiptSeries(active.id) : null;

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        <span className="v2-gradient-text">
          <Tri bm="Tetapan" zh="设置" en="Settings" />
        </span>
      </h1>

      <div className="flex flex-col gap-8">
        {/* 1 — the reason most people open this page */}
        <SettingsSection
          title={<Tri bm="Paparan" zh="显示" en="Display" />}
        >
          <AppearanceRows />
        </SettingsSection>

        {/* 2 — the account itself */}
        <SettingsSection title={<Tri bm="Akaun" zh="账号" en="Account" />}>
          <SettingsRow
            label={<Tri bm="Log masuk sebagai" zh="登入的账号" en="Signed in as" />}
          >
            <p className="break-words text-base font-medium">{user?.email}</p>
          </SettingsRow>
          {user?.email && <ChangePasswordRows email={user.email} />}
        </SettingsSection>

        {/* 3 — which organisation, and what that means for documents */}
        <SettingsSection
          title={<Tri bm="Pertubuhan" zh="机构" en="Organisation" />}
        >
          <SettingsRow
            label={<Tri bm="Pertubuhan aktif" zh="当前机构" en="Active organisation" />}
            help={
              <Tri
                bm="Nama ini dicetak pada setiap resit, minit dan dokumen rasmi yang Minit hasilkan untuk anda."
                zh="这个名字会印在 Minit 帮您做的每一张收据、每一份会议记录和每一份官方文件上。"
                en="This name is printed on every receipt, minutes document and official document Minit makes for you."
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
                <Link
                  href="/orgs"
                  className="w-fit text-base underline underline-offset-4"
                >
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
                  <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-medium leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                    ⚠{" "}
                    <Tri
                      bm="Tiada status s.44(6), jadi resit anda TIDAK boleh menyebut pelepasan cukai — dan Minit tidak akan mencetaknya. s.44(6) ialah kelulusan LHDN yang mesti diluluskan dahulu."
                      zh="没有 s.44(6) 身份，所以您的收据不可以写「可扣税」—— Minit 也不会印上去。s.44(6) 是税务局（LHDN）的批准，必须先获批。"
                      en="No s.44(6) status, so your receipts must NOT mention tax relief — and Minit will not print it. s.44(6) is an LHDN approval that has to be granted first."
                    />
                  </p>
                )}
              </div>
            </SettingsRow>
          )}

          {/* R-6: whether the optional e-Invois pages show at all. */}
          {active && <EinvoisRows />}

          {active && receiptSeries && (
            <ReceiptSeriesRows
              orgId={active.id}
              prefix={receiptSeries.prefix}
              frozen={receiptSeries.frozen}
              year={Number(dayIsoMalaysia(new Date().toISOString())!.slice(0, 4))}
            />
          )}

          {/* 2026-08-19 — the org's own vocabulary. The one thing a society can
              do to make the AI better at its papers, and the answer to "why did
              it spell our member's name wrong". */}
          <SettingsRow
            label={<Tri bm="Perkataan Kami" zh="我们的词库" en="Our Words" />}
            help={
              <Tri
                bm="Ajar Minit nama dan istilah pertubuhan anda, supaya ia membacanya dengan tepat dan menulisnya sama setiap kali."
                zh="教 Minit 你们社团的人名和专门用词 —— 读的时候不容易认错，写出来每次都一样。"
                en="Teach Minit your organisation's names and terms, so it reads them accurately and writes them the same way every time."
              />
            }
          >
            <Link href="/glossary" className="text-base underline underline-offset-4">
              <Tri bm="Buka senarai perkataan" zh="打开词库" en="Open the glossary" /> →
            </Link>
          </SettingsRow>
        </SettingsSection>

        {/* 4 — the AI meter */}
        {usage && (
          <SettingsSection
            title={<Tri bm="Bantuan AI" zh="AI 用量" en="AI usage" />}
          >
            <AiUsageRows usage={usage} />
          </SettingsSection>
        )}

        {/* 5 — 2026-07-28 audit: /health had ZERO links anywhere in src. The one
            page that explains a missing configuration was reachable only by
            typing the URL, which is exactly what a beginner cannot do. */}
        <SettingsSection title={<Tri bm="Sistem" zh="系统" en="System" />}>
          <SettingsRow
            label={
              <Tri
                bm="Semakan sistem"
                zh="系统检查"
                en="System check"
              />
            }
            help={
              <Tri
                bm="Kalau gambar tidak dibaca atau rekod tidak tersimpan, halaman ini menunjukkan bahagian mana yang tidak bersambung. Tunjukkan kepada orang yang memasang Minit untuk anda."
                zh="如果照片读不出来，或者记录存不进去，这一页会显示是哪一部分没有连上。可以把这一页给帮您安装 Minit 的人看。"
                en="If photos are not being read or records are not saving, this page shows which part is not connected. Show it to whoever set Minit up for you."
              />
            }
          >
            <Link href="/health" className="text-base underline underline-offset-4">
              <Tri bm="Buka semakan" zh="打开检查" en="Open the check" /> →
            </Link>
          </SettingsRow>
        </SettingsSection>

        {/* R-5: "delete the register on this device" moved here from the
            /money page header, behind a typed confirmation. */}
        {active && <DeleteRegisterSection orgName={active.name} />}

        {active && active.role === "hq_admin" && (
          <DeleteOrgSection orgId={active.id} orgName={active.name} />
        )}
      </div>
    </div>
  );
}
