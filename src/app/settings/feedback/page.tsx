import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { FeedbackCard } from "../feedback-card";

// ---------------------------------------------------------------------------
// /settings/feedback — the feedback channel on its own page (§1-13, work
// order 32: the settings split). K-1's card, unchanged: free, no AI, lands
// in the operator's /admin inbox.
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
    </div>
  );
}
