import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { EinvoisRows } from "../einvois-rows";
import { SettingsSection } from "../ui";

// /settings/einvois — the optional e-Invois switch (§7.2b). R-6: whether
// the e-Invois pages show at all (default off — eROSES is the legal
// requirement; e-Invois is opt-in).
export const dynamic = "force-dynamic";

export default async function EinvoisSettingsPage() {
  const active = await getActiveOrg();

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="e-Invois (LHDN)" zh="e-Invois（LHDN）" en="e-Invois (LHDN)" />
      </h1>
      {!active ? (
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
      ) : (
        <SettingsSection title={<Tri bm="Tetapan" zh="设置" en="Setting" />}>
          <EinvoisRows />
        </SettingsSection>
      )}
    </div>
  );
}
