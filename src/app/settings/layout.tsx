import type { ReactNode } from "react";
import { SettingsNav } from "./settings-nav";

// ---------------------------------------------------------------------------
// /settings/* — the sub-sidebar frame (violet redesign §7). Thirteen
// directly-linkable screens; the second column sits between the icon rail
// and a 760px content pane on ≥1024px, and becomes a tab strip below.
// ---------------------------------------------------------------------------

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:-my-6 lg:flex-row lg:gap-0">
      <SettingsNav />
      <div className="min-w-0 flex-1 lg:py-8 lg:pl-8">
        <div className="w-full max-w-[760px]">{children}</div>
      </div>
    </div>
  );
}
