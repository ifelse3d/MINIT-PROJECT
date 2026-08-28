import type { ReactNode } from "react";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { SettingsNav } from "./settings-nav";

// ---------------------------------------------------------------------------
// /settings/* — the sub-sidebar frame (violet redesign §7, reshaped for J's
// launch feedback #12, 2026-08-27 evening: the MAIN rail hides inside
// settings — shell.tsx does that — so this column is the only sidebar, and
// it carries its own "back to the app" row).
//
// #11 (same feedback): the System check is an administrator's tool — the nav
// row and the page row only exist for manage_org roles. /health keeps its own
// server-side gate regardless of what this layout says.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const active = await getActiveOrg();
  const showSystem = active !== null && can(active.role, "manage_org");
  return (
    <div className="flex flex-col gap-4 @4xl:-my-6 @4xl:flex-row @4xl:gap-0">
      <SettingsNav showSystem={showSystem} />
      <div className="min-w-0 flex-1 @4xl:py-8 @4xl:pl-8">
        <div className="w-full max-w-[760px]">{children}</div>
      </div>
    </div>
  );
}
