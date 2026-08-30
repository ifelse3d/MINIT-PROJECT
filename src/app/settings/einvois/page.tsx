import Link from "next/link";
import { notFound } from "next/navigation";
import { Tri } from "@/components/language-provider";
import { EinvoisBetaBadge } from "@/components/einvois-beta-badge";
import { getSessionUser } from "@/db/supabase-server";
import { isOperatorEmail } from "@/lib/admin-gate";
import { getActiveOrg } from "@/lib/active-org";
import { EinvoisRows } from "../einvois-rows";
import { SettingsSection } from "../ui";

// /settings/einvois — the optional e-Invois switch (§7.2b). R-6: whether
// the e-Invois pages show at all (default off — eROSES is the legal
// requirement; e-Invois is opt-in).
//
// D49 (work order 94): operator-only while the e-Invois beta gate stands —
// the switch itself is part of the hidden surface. Fail-closed 404, same
// door as /admin; the menus already hide the row via the provider.
export const dynamic = "force-dynamic";

export default async function EinvoisSettingsPage() {
  const user = await getSessionUser().catch(() => null);
  if (!isOperatorEmail(user?.email)) notFound();
  const active = await getActiveOrg();

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
        <Tri bm="e-Invois (LHDN)" zh="e-Invois（LHDN）" en="e-Invois (LHDN)" />
        <EinvoisBetaBadge />
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
