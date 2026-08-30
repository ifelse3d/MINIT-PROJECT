import { notFound } from "next/navigation";
import { EInvoisPack } from "../einvois-pack";
import { FromAiNote } from "@/components/from-ai-note";
import { getSessionUser } from "@/db/supabase-server";
import { isOperatorEmail } from "@/lib/admin-gate";
import { getActiveOrg } from "@/lib/active-org";
import { getFenceState } from "@/lib/fence";

// Step 4 of the /money flow: the month-end e-Invois file for LHDN.
//
// D49 (work order 94): operator-only while the e-Invois beta gate stands.
// This deliberately breaks the older "the route always works so a saved link
// still works" promise FOR NON-OPERATORS: a hidden beta reachable by URL is
// not hidden. Fail-closed 404, same door as /admin.
export default async function MoneyEInvoisPage() {
  const user = await getSessionUser().catch(() => null);
  if (!isOperatorEmail(user?.email)) notFound();
  // D44: null = paid org, the page stays exactly as it was. An .xlsx cannot
  // carry a watermark, so for a fenced org every pack export is the clean
  // artifact and is counted — the button says so before it is pressed.
  const active = await getActiveOrg().catch(() => null);
  const fenceState = active ? await getFenceState(active) : null;
  return (
    <>
      {/* F-6: the assistant's e-Invois button lands here with ?dari=ai. */}
      <FromAiNote
        bm="di sinilah fail e-Invois hujung bulan dijana untuk dimuat naik."
        zh="在这里生成月底的 e-Invois 上传文件。"
        en="this is where the month-end e-Invois upload file is generated."
      />
      <EInvoisPack
        fence={
          fenceState
            ? {
                docsRemaining: fenceState.remaining.docs,
                downloadsRemaining: fenceState.remaining.downloads,
              }
            : null
        }
      />
    </>
  );
}
