import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { listInvites, listMembers } from "../member-actions";
import { MembersRows } from "../members-rows";
import { SettingsSection } from "../ui";

// /settings/members — members & invite codes (§7.2b). Admins only; other
// roles get an honest sentence, not an empty page.
export const dynamic = "force-dynamic";

export default async function MembersSettingsPage() {
  const active = await getActiveOrg();
  const isAdmin = active !== null && can(active.role, "manage_org");
  const [members, invites] = isAdmin
    ? await Promise.all([listMembers(active.id), listInvites(active.id)])
    : [[], []];

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Ahli & jemputan" zh="成员与邀请" en="Members & invites" />
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
      ) : !isAdmin ? (
        <p className="v2-glass p-5 text-base text-muted-foreground">
          <Tri
            bm="Hanya pentadbir pertubuhan boleh mengurus ahli dan kod jemputan. Minta pentadbir anda."
            zh="只有机构管理员可以管理成员和邀请码。请找您的管理员。"
            en="Only an organisation administrator can manage members and invite codes. Ask your administrator."
          />
        </p>
      ) : (
        <SettingsSection title={<Tri bm="Ahli" zh="成员" en="Members" />}>
          <MembersRows members={members} invites={invites} />
        </SettingsSection>
      )}
    </div>
  );
}
