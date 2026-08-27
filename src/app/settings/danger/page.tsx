import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { DeleteOrgSection } from "../delete-org-section";
import { DeleteRegisterSection } from "../delete-register-section";

// /settings/danger — the two destructive blocks, on their OWN route (§7.5):
// they must not be reachable by scrolling past ordinary preferences. Both
// keep their typed-confirmation flows; delete-organisation stays hq_admin
// only.
export const dynamic = "force-dynamic";

export default async function DangerSettingsPage() {
  const active = await getActiveOrg();

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight text-[#b91c1c]">
        <Tri bm="Zon bahaya" zh="危险区" en="Danger zone" />
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
        <>
          <DeleteRegisterSection orgName={active.name} />
          {active.role === "hq_admin" ? (
            <DeleteOrgSection orgId={active.id} orgName={active.name} />
          ) : (
            <p className="text-sm text-muted-foreground">
              <Tri
                bm="Memadam pertubuhan hanya boleh dilakukan oleh pentadbir HQ."
                zh="删除机构只有总会管理员可以做。"
                en="Deleting the organisation can only be done by an HQ administrator."
              />
            </p>
          )}
        </>
      )}
    </div>
  );
}
