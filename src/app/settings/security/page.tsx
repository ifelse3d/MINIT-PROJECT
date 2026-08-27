import { Tri } from "@/components/language-provider";
import { getSessionUser } from "@/db/supabase-server";
import { ChangePasswordRows } from "../change-password-rows";
import { SettingsSection } from "../ui";

// /settings/security — change password (§7.2b).
export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const user = await getSessionUser();

  return (
    <div className="flex flex-col gap-6 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        <Tri bm="Kata laluan & keselamatan" zh="密码与安全" en="Password & security" />
      </h1>
      <SettingsSection title={<Tri bm="Kata laluan" zh="密码" en="Password" />}>
        {user?.email && <ChangePasswordRows email={user.email} />}
      </SettingsSection>
    </div>
  );
}
