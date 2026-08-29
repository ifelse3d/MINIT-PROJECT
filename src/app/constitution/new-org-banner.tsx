import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The "you have just created your organisation" banner on /constitution.
//
// 2026-08-22, J: "之前又说 CREATE ORGANIZATION 那边不是说可以 upload 他们的
// PERLEMBAGAAN 然后 AI 拿吗？" — the upload existed, but only on this page, and
// nothing on the create-an-organisation path ever mentioned it. So a brand-new
// society was told "photograph your meeting notes" and never learned that Minit
// could read its constitution at all.
//
// J chose (a): /orgs/new sends you STRAIGHT here after the organisation is
// created, and you can skip. Not (b) — an upload box inside the create form —
// which would have meant rebuilding the create flow around a file upload.
//
// WHY IT IS SKIPPABLE, AND SAYS SO FIRST.
// A constitution is a book. Someone creating an org on a phone at 11pm does not
// have it in front of them, and a setup step you cannot get past is how people
// abandon an app on the first screen. So the two onboarding buttons that used
// to live in the create form's success panel are HERE, as the skip path — the
// journey continues either way.
//
// COST, since "AI reads a 30-page book" sounds expensive: with the current
// model (gemini-3.5-flash-lite) a 30-page constitution is about RM 0.12 and 1
// of the 100 free monthly actions, once in the life of the society.
// AI_DOC_MAX_PAGES (default 50) refuses anything longer before a vendor is
// called. See _J-要做的事/11-HANDOFF-给下一个session-20260822.md section 4.3.
// ---------------------------------------------------------------------------

export function NewOrgBanner() {
  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-green-400 bg-green-50/70 p-4 dark:border-green-500/40 dark:bg-green-400/10">
      <p className="text-lg font-semibold text-green-900 dark:text-green-100">
        ✓{" "}
        <Tri
          bm="Siap. Pertubuhan anda sudah didaftarkan dalam MinitAI."
          zh="好了。您的机构已经登记在 MinitAI 里。"
          en="Done. Your organisation is now set up in MinitAI."
        />
      </p>
      <p className="text-base text-green-900 dark:text-green-100">
        <Tri
          bm="Kalau perlembagaan anda ada di tangan sekarang, ambil gambar setiap halaman di bawah. MinitAI membacanya sekali sahaja, dan selepas itu setiap jawapan memetik fasal anda sendiri. Kalau tiada — langkau, ia boleh dibuat bila-bila masa."
          zh="如果章程现在就在手上，请在下面把每一页拍下来。MinitAI 只需要读一次，之后每个答案都会引用您自己的条文。如果不在手上 —— 先跳过，随时可以再做。"
          en="If your constitution is in front of you now, photograph each page below. MinitAI reads it once, and after that every answer quotes your own clauses. If it is not — skip it, this can be done any time."
        />
      </p>
      {/* R-3 (2026-08-25): the last wizard step — "what do you want to do
          first?" — phrased as the person's own jobs, not as "skip". */}
      <p className="text-base font-semibold text-green-900 dark:text-green-100">
        <Tri
          bm="Atau, apa yang anda mahu buat dahulu?"
          zh="或者，您想先做哪件事？"
          en="Or — what would you like to do first?"
        />
      </p>
      <div className="flex flex-wrap gap-3">
        {/* §1-6 (work order 69): the constitution is step 1 of the guided
            sequence — whichever way this page ends, the sequence continues
            at /orgs/welcome (roster, then Maklumat Am). */}
        <Button asChild size="lg" variant="outline">
          <Link href="/orgs/welcome">
            🧭{" "}
            <Tri
              bm="Teruskan persediaan (AJK & Maklumat Am)"
              zh="继续开机构引导（名册与基本资料）"
              en="Continue the setup (roster & Maklumat Am)"
            />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/minutes">
            📝{" "}
            <Tri
              bm="Hantar minit mesyuarat"
              zh="上交会议记录"
              en="Submit meeting minutes"
            />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/">
            🏠 <Tri bm="Ke halaman utama" zh="回到主页" en="Go to the home page" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
