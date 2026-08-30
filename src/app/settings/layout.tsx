import type { ReactNode } from "react";
import { getSessionUser } from "@/db/supabase-server";
import { isOperatorEmail } from "@/lib/admin-gate";
import { SettingsNav } from "./settings-nav";

// ---------------------------------------------------------------------------
// /settings/* — the sub-sidebar frame (violet redesign §7, reshaped for J's
// launch feedback #12, 2026-08-27 evening: the MAIN rail hides inside
// settings — shell.tsx does that — so this column is the only sidebar, and
// it carries its own "back to the app" row).
//
// #11, retuned by 97 §7 (93 号拍板): the System check row follows the PAGE's
// own audience now — /health went operator-only in work order 86 ③ (platform
// admins, the ADMIN_EMAILS list), so showing the row to org admins was a
// door painted on a wall: they clicked it and got refused. Row and page gate
// on the same fact (same precedent as einvoisOperatorOnly). /health keeps
// its own server-side gate regardless of what this layout says.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const showSystem = isOperatorEmail(user?.email);
  return (
    <div className="flex flex-col gap-4 @4xl:-my-6 @4xl:flex-row @4xl:gap-0">
      <SettingsNav showSystem={showSystem} />
      <div className="min-w-0 flex-1 @4xl:py-8 @4xl:pl-8">
        <div className="w-full max-w-[760px]">{children}</div>
      </div>
    </div>
  );
}
