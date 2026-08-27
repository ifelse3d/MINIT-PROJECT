import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getSessionUser } from "@/db/supabase-server";
import { AppearanceRows } from "./appearance-rows";
import { ChangePasswordRows } from "./change-password-rows";
import { SettingsRow, SettingsSection } from "./ui";

// /settings — YOUR ACCOUNT & DISPLAY only, since the §1-13 split (work order
// 32; avocado measured the old page at 3161px and J said the same thing in
// his own words). One page per job now, per CLAUDE.md rule 13:
//
//   /settings          THIS — display (text size, language), account
//                      (email, password), system check
//   /settings/org      the organisation: identity, tax, members & invites,
//                      e-Invois switch, receipt letters, glossary, deletes
//   /settings/plan     plan & usage (unchanged; gained the by-member split)
//   /settings/feedback the feedback channel
//
// Earlier history of this page: 2026-07-28 ("感觉也没什么用处") rebuilt it
// around changeable things; 2026-08-22 ("SETTING 這裏就太亂了") folded the
// prose. Nothing was deleted in the split — every block has a new home.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        <span className="v2-gradient-text">
          <Tri bm="Akaun & paparan" zh="账号与显示" en="Account & display" />
        </span>
      </h1>

      <div className="flex flex-col gap-8">
        {/* 1 — the reason most people open this page */}
        <SettingsSection title={<Tri bm="Paparan" zh="显示" en="Display" />}>
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

        {/* 3 — 2026-07-28 audit: /health had ZERO links anywhere in src. The one
            page that explains a missing configuration was reachable only by
            typing the URL, which is exactly what a beginner cannot do. */}
        <SettingsSection title={<Tri bm="Sistem" zh="系统" en="System" />}>
          {/* C-2 (anti-impersonation v1): the report channel. Only rendered
              when a contact address is configured — a report button that goes
              nowhere is worse than none. */}
          {process.env.NEXT_PUBLIC_CONTACT_EMAIL && (
            <SettingsRow
              label={
                <Tri
                  bm="Laporkan penyalahgunaan"
                  zh="检举冒用"
                  en="Report impersonation"
                />
              }
              help={
                <Tri
                  bm="Jika seseorang membuka pertubuhan atas nama persatuan anda tanpa hak, laporkan kepada kami. Membuka pertubuhan atas nama orang lain melanggar Syarat Penggunaan — akaun boleh digantung dan kami bekerjasama dengan pihak berkuasa."
                  zh="如果有人未经授权冒用贵社团的名义在 Minit 开机构，请向我们检举。冒名开机构违反《使用条款》—— 账号会被封禁，我们也会配合执法单位。"
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
          <SettingsRow
            label={<Tri bm="Semakan sistem" zh="系统检查" en="System check" />}
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

        {/* The split's cross-links, for anyone who lands here from an old
            bookmark expecting the long page. */}
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Mencari tetapan pertubuhan, resit atau ahli?"
            zh="要找机构、收据字号或成员的设置？"
            en="Looking for organisation, receipt or member settings?"
          />{" "}
          <Link href="/settings/org" className="underline underline-offset-4">
            <Tri bm="Pertubuhan & resit" zh="机构与收据" en="Organisation & receipts" /> →
          </Link>
        </p>
      </div>
    </div>
  );
}
