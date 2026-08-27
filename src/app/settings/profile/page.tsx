import { Tri } from "@/components/language-provider";
import { getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
import { SettingsRow, SettingsSection } from "../ui";

// /settings/profile — who is signed in (§7.2b). Only the fields that exist:
// email, and the active org's role. Nothing is invented (§7.2 note).
export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const [user, active] = await Promise.all([getSessionUser(), getActiveOrg()]);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Profil saya" zh="我的账号" en="My profile" />
      </h1>
      <SettingsSection title={<Tri bm="Akaun" zh="账号" en="Account" />}>
        <SettingsRow label={<Tri bm="Log masuk sebagai" zh="登入的账号" en="Signed in as" />}>
          <p className="break-words text-base font-medium">{user?.email}</p>
        </SettingsRow>
        {active?.role && (
          <SettingsRow
            label={<Tri bm="Peranan" zh="在当前机构的角色" en="Role" />}
            sub={active ? <span>{active.name}</span> : undefined}
          >
            <p className="text-base font-medium">
              <Tri {...labelFor(ROLE_LABEL, active.role)} />
            </p>
          </SettingsRow>
        )}
      </SettingsSection>
    </div>
  );
}
