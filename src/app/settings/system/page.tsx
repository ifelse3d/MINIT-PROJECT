import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getSessionUser } from "@/db/supabase-server";
import { isOperatorEmail } from "@/lib/admin-gate";
import { SettingsRow, SettingsSection } from "../ui";

// /settings/system — the system check + the impersonation report (§7.2b).
// Work order 85 ③ (J, 2026-08-30: 「只有我可以看」): the system-check row is
// the PLATFORM OPERATOR's tool — the old manage_org gate dated from the
// self-hosted assumption, under which every org creator would have seen the
// deployment's env-variable map. The impersonation-report row stays for
// everyone. /health keeps its own server-side ADMIN_EMAILS gate regardless.
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
        {process.env.NEXT_PUBLIC_CONTACT_EMAIL && (
          <SettingsRow
            label={
              <Tri bm="Laporkan penyalahgunaan" zh="检举冒用" en="Report impersonation" />
            }
            help={
              <Tri
                bm="Jika seseorang membuka pertubuhan atas nama persatuan anda tanpa hak, laporkan kepada kami. Membuka pertubuhan atas nama orang lain melanggar Syarat Penggunaan — akaun boleh digantung dan kami bekerjasama dengan pihak berkuasa."
                zh="如果有人未经授权冒用贵社团的名义在 MinitAI 开机构，请向我们检举。冒名开机构违反《使用条款》—— 账号会被封禁，我们也会配合执法单位。"
                en="If someone has set up an organisation in your society's name without authority, report it to us. Impersonating an organisation breaches the Terms of Use — accounts are suspended and we cooperate with the authorities."
              />
            }
          >
            <a
              href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}?subject=${encodeURIComponent("Laporan penyalahgunaan / 检举冒用 / Impersonation report")}`}
              className="text-base underline underline-offset-4"
            >
              <Tri bm="Hantar laporan" zh="发送检举" en="Send a report" /> →
            </a>
          </SettingsRow>
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
