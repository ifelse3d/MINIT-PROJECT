import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { FeedbackCard } from "../feedback-card";

// ---------------------------------------------------------------------------
// /settings/feedback — the feedback channel on its own page (§1-13, work
// order 32: the settings split). K-1's card, unchanged: free, no AI, lands
// in the operator's /admin inbox.
//
// 97 §7 (93 号拍板原话): the impersonation-report row lives HERE now — it is
// a member-facing channel, and its old home (/settings/system) became the
// operator's page, where ordinary members could never find it.
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";

export default async function FeedbackSettingsPage() {
  const active = await getActiveOrg();

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        <Tri bm="Maklum balas" zh="反馈" en="Feedback" />
      </h1>
      {active ? (
        <FeedbackCard />
      ) : (
        <p className="v2-glass p-5 text-base">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan dahulu"
              zh="请先选择或创建机构"
              en="Choose or create an organisation first"
            />{" "}
            →
          </Link>
        </p>
      )}

      {process.env.NEXT_PUBLIC_CONTACT_EMAIL && (
        <div className="v2-glass mt-6 flex flex-col gap-2 p-5">
          <p className="text-base font-semibold">
            <Tri bm="Laporkan penyalahgunaan" zh="检举冒用" en="Report impersonation" />
          </p>
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Jika seseorang membuka pertubuhan atas nama persatuan anda tanpa hak, laporkan kepada kami. Membuka pertubuhan atas nama orang lain melanggar Syarat Penggunaan — akaun boleh digantung dan kami bekerjasama dengan pihak berkuasa."
              zh="如果有人未经授权冒用贵社团的名义在 MinitAI 开机构，请向我们检举。冒名开机构违反《使用条款》—— 账号会被封禁，我们也会配合执法单位。"
              en="If someone has set up an organisation in your society's name without authority, report it to us. Impersonating an organisation breaches the Terms of Use — accounts are suspended and we cooperate with the authorities."
            />
          </p>
          <a
            href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}?subject=${encodeURIComponent("Laporan penyalahgunaan / 检举冒用 / Impersonation report")}`}
            className="self-start text-base underline underline-offset-4"
          >
            <Tri bm="Hantar laporan" zh="发送检举" en="Send a report" /> →
          </a>
        </div>
      )}
    </div>
  );
}
