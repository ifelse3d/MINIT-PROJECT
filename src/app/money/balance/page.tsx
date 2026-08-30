import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// /money/balance → /money/report (97 §4, J 8/30 拍板: Current funds 併入
// Financial statement). The balance card — eye and all — sits at the TOP of
// the statement page now. This route stays so old links and bookmarks keep
// working; a plain redirect, NOT a 308, so the address can be given a page
// of its own again without fighting browser caches (the /filings lesson).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default function MoneyBalancePage() {
  redirect("/money/report");
}
