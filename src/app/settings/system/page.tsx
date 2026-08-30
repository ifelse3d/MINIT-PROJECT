import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getSessionUser } from "@/db/supabase-server";
import { isOperatorEmail } from "@/lib/admin-gate";
import { SettingsRow, SettingsSection } from "../ui";

// /settings/system — the system check (§7.2b).
// Work order 85 ③ (J, 2026-08-30: 「只有我可以看」): the system-check row is
// the PLATFORM OPERATOR's tool — the old manage_org gate dated from the
// self-hosted assumption, under which every org creator would have seen the
// deployment's env-variable map. 97 §7 (93 号拍板): the impersonation-report
// row moved to /settings/feedback — it is a member-facing channel, and this
// page's audience shrank to the operator (the settings nav row now follows).
// /health keeps its own server-side ADMIN_EMAILS gate regardless.
export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const user = await getSessionUser().catch(() => null);
  const isOperator = isOperatorEmail(user?.email);
  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Semakan sistem" zh="系统检查" en="System check" />
      </h1>
      <SettingsSection title={<Tri bm="Sistem" zh="系统" en="System" />}>
        {!isOperator && (
          <p className="p-4 text-base text-muted-foreground">
            <Tri
              bm="Halaman ini untuk pentadbir platform MinitAI sahaja. Untuk melaporkan penyalahgunaan nama pertubuhan, gunakan halaman Maklum balas."
              zh="这一页只给 MinitAI 平台管理员用。要检举冒用社团名义，请到「反馈」页。"
              en="This page is for the MinitAI platform administrator only. To report impersonation of your society, use the Feedback page."
            />{" "}
            <Link href="/settings/feedback" className="underline underline-offset-4">
              <Tri bm="Ke Maklum balas" zh="去反馈页" en="To Feedback" /> →
            </Link>
          </p>
        )}
        {isOperator && (
          <SettingsRow
            label={<Tri bm="Semakan sistem" zh="系统检查" en="System check" />}
            help={
              <Tri
                bm="Keadaan sistem MinitAI itu sendiri — sambungan pangkalan data dan kunci AI. Hanya pentadbir platform MinitAI nampak baris ini."
                zh="MinitAI 系统本身的状态 —— 数据库连接、AI 密钥等。只有 MinitAI 平台管理员看得到这一行。"
                en="The state of the MinitAI system itself — database connection, AI keys. Only the MinitAI platform administrator sees this row."
              />
            }
          >
            <Link href="/health" className="text-base underline underline-offset-4">
              <Tri bm="Buka semakan" zh="打开检查" en="Open the check" /> →
            </Link>
          </SettingsRow>
        )}
      </SettingsSection>
    </div>
  );
}
