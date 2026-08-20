import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
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
import { getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { getUsage } from "@/lib/ai/usage";
import { AiUsageCard } from "./ai-usage-card";
import { AppearanceCard } from "./appearance-card";
import { DeleteOrgSection } from "./delete-org-section";

// /settings
//
// 2026-07-28, user: "这个 setting page 感觉也没什么用处". It was true — the page
// listed four read-only facts and offered exactly one action (delete everything).
// A settings page has to answer "what can I change about how this works?", so it
// now leads with the things a person actually wants to change:
//
//   1. Saiz tulisan & warna — text size (4 steps), light/dark, language.
//      This is the top card because "the writing is too small" is the single most
//      common complaint from our users, and until now they could do nothing about it.
//   2. Pertubuhan — which organisation, who you are in it, tax status + what it
//      legally means (Hard Rule 3), and the switch link.
//   3. Bantuan AI — how much AI help is left this month and what uses it.
//   4. Semakan sistem — the /health page, which had no link anywhere.
//   5. Danger zone — delete organisation (hq_admin only, typed confirmation).
//
// Every card says what it is FOR in one plain line. Tax-exempt status stays
// read-only: see supabase/migrations/20260728000000_lock_org_privileged_columns.sql
// for why it must not be self-service.
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

export default async function SettingsPage() {
  const [user, active] = await Promise.all([getSessionUser(), getActiveOrg()]);
  const usage = active ? await getUsage(active.id) : null;

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        <span className="v2-gradient-text">
          <Tri bm="Tetapan" zh="设置" en="Settings" />
        </span>
      </h1>

      <div className="flex flex-col gap-6">
        {/* 1 — the reason most people open this page */}
        <AppearanceCard />

        {/* 2 — which organisation, and what that means for documents */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Tri
                bm="Pertubuhan anda"
                zh="您的机构"
                en="Your organisation"
              />
            </CardTitle>
            {active ? (
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">
                  {active.name}
                </span>
                {active.isDemo && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                    DEMO
                  </Badge>
                )}
                {active.role && (
                  <span>
                    · <Tri {...labelFor(ROLE_LABEL, active.role)} />
                  </span>
                )}
                <span>
                  · <Tri bm="Status cukai" zh="税务状态" en="Tax status" />:{" "}
                  {TAX_LABEL[active.taxExemptStatus] ? (
                    <Tri {...TAX_LABEL[active.taxExemptStatus]} />
                  ) : (
                    active.taxExemptStatus
                  )}
                </span>
              </CardDescription>
            ) : (
              <CardDescription>
                <Link href="/orgs" className="underline">
                  <Tri
                    bm="Pilih atau cipta pertubuhan dahulu"
                    zh="请先选择或创建组织"
                    en="Choose or create an organisation first"
                  />
                </Link>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-base text-muted-foreground">
              <Tri
                bm="Nama ini dicetak pada setiap resit, minit dan dokumen rasmi yang Minit hasilkan untuk anda."
                zh="这个名字会印在 Minit 帮您做的每一张收据、每一份会议记录和每一份官方文件上。"
                en="This name is printed on every receipt, minutes document and official document Minit makes for you."
              />
            </p>
            {active && active.taxExemptStatus === "none" && (
              <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                ⚠{" "}
                <Tri
                  bm="Pertubuhan ini belum ada status s.44(6), jadi resit anda TIDAK boleh menyebut pelepasan cukai — dan Minit tidak akan mencetaknya. s.44(6) ialah kelulusan LHDN yang membenarkan penderma menuntut potongan cukai; ia mesti diluluskan dahulu. Status ini tidak boleh ditukar sendiri di sini, atas sebab undang-undang."
                  zh="这个机构还没有 s.44(6) 身份，所以您的收据不可以写「可扣税」—— Minit 也不会印上去。s.44(6) 是税务局（LHDN）的批准，有了它捐款人才能申报扣税；必须先获批。基于法律考量，这个身份不能在这里自己改。"
                  en="This organisation has no s.44(6) status, so your receipts must NOT mention tax relief — and Minit will not print it. s.44(6) is an LHDN approval that lets a donor claim a tax deduction; it has to be granted first. For legal reasons this status cannot be changed here by yourself."
                />
              </p>
            )}
            <p className="text-base">
              <Link href="/orgs" className="underline underline-offset-4">
                <Tri
                  bm="Tukar pertubuhan, atau tambah cawangan"
                  zh="切换机构，或添加分会"
                  en="Switch organisation, or add a branch"
                />{" "}
                →
              </Link>
            </p>
            <p className="text-base text-muted-foreground">
              <Tri bm="Anda log masuk sebagai" zh="您登入的账号" en="Signed in as" />{" "}
              <span className="font-medium text-foreground">{user?.email}</span>
            </p>
          </CardContent>
        </Card>

        {/* 2026-08-19 — the org's own vocabulary. Sits next to the AI card
            because it is the one thing a society can do to make the AI better
            at its papers, and it is the answer to "why did it spell our
            member's name wrong". */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Tri bm="Perkataan Kami" zh="我们的词库" en="Our Words" />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Ajar Minit nama dan istilah pertubuhan anda, supaya ia membacanya dengan tepat dan menulisnya sama setiap kali."
                zh="教 Minit 你们社团的人名和专门用词 —— 读的时候不容易认错，写出来每次都一样。"
                en="Teach Minit your organisation's names and terms, so it reads them accurately and writes them the same way every time."
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/glossary" className="text-base underline underline-offset-4">
              <Tri bm="Buka senarai perkataan" zh="打开词库" en="Open the glossary" /> →
            </Link>
          </CardContent>
        </Card>

        {usage && <AiUsageCard usage={usage} />}

        {/* 2026-07-28 audit: /health had ZERO links anywhere in src — the one
            page that explains a missing configuration was reachable only by
            typing the URL, which is exactly what a beginner cannot do. */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Tri
                bm="Minit berfungsi dengan betul?"
                zh="Minit 运作正常吗？"
                en="Is Minit working properly?"
              />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Kalau gambar tidak dibaca atau rekod tidak tersimpan, halaman ini menunjukkan bahagian mana yang tidak bersambung. Tunjukkan kepada orang yang memasang Minit untuk anda."
                zh="如果照片读不出来，或者记录存不进去，这一页会显示是哪一部分没有连上。可以把这一页给帮您安装 Minit 的人看。"
                en="If photos are not being read or records are not saving, this page shows which part is not connected. Show it to whoever set Minit up for you."
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/health"
              className="text-base underline underline-offset-4"
            >
              <Tri
                bm="Buka semakan sistem"
                zh="打开系统检查"
                en="Open the system check"
              />{" "}
              →
            </Link>
          </CardContent>
        </Card>

        {active && active.role === "hq_admin" && (
          <DeleteOrgSection orgId={active.id} orgName={active.name} />
        )}
      </div>
    </div>
  );
}
