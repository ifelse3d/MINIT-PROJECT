import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";
import { loadFlowMaklumat } from "@/app/filings/eroses/flow-data";
import { WelcomeFlow } from "./welcome-flow";

// /orgs/welcome — where a freshly created organisation LANDS (H3, work order
// 69 §1-6). Server component: DONE-ness comes from the database, so a step
// finished on its own page ticks itself here; the client only remembers
// explicit skips per device.

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const active = await getActiveOrg().catch(() => null);
  if (!active) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-10">
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
      </div>
    );
  }

  const supabase = await getSupabaseServer();
  const [constitutionRead, rosterRead, maklumat] = await Promise.all([
    supabase
      .from("constitutions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", active.id),
    supabase
      .from("committee_roster")
      .select("id", { count: "exact", head: true })
      .eq("org_id", active.id),
    loadFlowMaklumat(active.id),
  ]);

  const maklumatDone =
    maklumat !== null &&
    (maklumat.phone !== null ||
      maklumat.financialYearStart !== null ||
      maklumat.banks.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            🎉{" "}
            <Tri
              bm="Pertubuhan anda sudah siap!"
              zh="您的机构开好了！"
              en="Your organisation is set up!"
            />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm={`${active.name} — tiga perkara ini melengkapkannya. Buat satu-satu, atau tekan “Isi kemudian” untuk melangkau; tiada satu pun menghalang anda bekerja.`}
            zh={`${active.name} —— 把这三样打好底就齐了。一步一步来，或按「稍后填」跳过；哪一样都不挡你先干活。`}
            en={`${active.name} — these three complete the setup. Take them one by one, or press “Fill in later” to skip; none of them blocks you from working.`}
          />
        </p>
      </div>

      <WelcomeFlow
        orgId={active.id}
        orgName={active.name}
        canManage={can(active.role, "manage_org")}
        hasConstitution={(constitutionRead.count ?? 0) > 0}
        rosterCount={rosterRead.count ?? 0}
        maklumatDone={maklumatDone}
        maklumat={maklumat}
      />

      <p className="text-sm text-muted-foreground">
        <Tri
          bm="Halaman ini sentiasa ada di sini — kembali bila-bila masa dari Pertubuhan."
          zh="这一页一直都在 —— 从「机构」随时可以回来。"
          en="This page stays here — come back any time from Organisations."
        />
      </p>
    </div>
  );
}
