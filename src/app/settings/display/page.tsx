import { Tri } from "@/components/language-provider";
import { AppearanceRows } from "../appearance-rows";
import { SettingsSection } from "../ui";

// /settings/display — text size · background · language (§7.2b rows 1–3).
export const dynamic = "force-dynamic";

export default function DisplaySettingsPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Paparan & bahasa" zh="显示与语言" en="Display & language" />
      </h1>
      <SettingsSection title={<Tri bm="Paparan" zh="显示" en="Display" />}>
        <AppearanceRows />
      </SettingsSection>
    </div>
  );
}
