import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { SettingsRow, SettingsSection } from "../ui";

// /settings/system — the system check + the impersonation report (§7.2b).
// #11 (J's launch feedback, 2026-08-27 evening): the system check is an
// administrator's tool. Ordinary members do not see the row here (nor the
// nav entry — settings-nav.tsx); /health keeps its own server-side gate.
export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  const active = await getActiveOrg();
  const isAdmin = active !== null && can(active.role, "manage_org");
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
        {isAdmin && (
          <SettingsRow
            label={<Tri bm="Semakan sistem" zh="系统检查" en="System check" />}
            help={
              <Tri
                bm="Kalau gambar tidak dibaca atau rekod tidak tersimpan, halaman ini menunjukkan bahagian mana yang tidak bersambung. Tunjukkan kepada orang yang memasang MinitAI untuk anda."
                zh="如果照片读不出来，或者记录存不进去，这一页会显示是哪一部分没有连上。可以把这一页给帮您安装 MinitAI 的人看。"
                en="If photos are not being read or records are not saving, this page shows which part is not connected. Show it to whoever set MinitAI up for you."
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
