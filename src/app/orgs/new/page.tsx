import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { CreateOrgForm } from "../create-org-form";

// /orgs/new — creating an organisation is its own page.
//
// 2026-07-28 — this form used to sit at the BOTTOM of /orgs, below every
// organisation card. With more than a couple of orgs you had to scroll past all
// of them to find it, so the single most important action on the page was the
// hardest thing to see. It now has a button at the top of /orgs and lives here,
// on a page with nothing else competing for attention.
export const dynamic = "force-dynamic";

export default async function NewOrgPage() {
  const supabase = await getSupabaseServer();

  // Allowed parents for a branch = the orgs this user administers. Same source
  // of truth the RLS policies use, so the dropdown can never offer an org the
  // server would then reject.
  const [orgsRes, adminRes] = await Promise.all([
    supabase.from("orgs").select("id, name").order("name"),
    supabase.rpc("accessible_orgs_admin"),
  ]);

  const adminIds = new Set<number>(
    ((adminRes.data as unknown[]) ?? []).map((v) =>
      typeof v === "number"
        ? v
        : Number(Object.values(v as Record<string, unknown>)[0]),
    ),
  );
  const parentChoices = ((orgsRes.data ?? []) as { id: number; name: string }[])
    .filter((o) => adminIds.has(o.id))
    .map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="mx-auto w-full max-w-3xl pb-10">
      <Button asChild variant="outline" size="sm" className="mb-6">
        <Link href="/orgs">
          ←{" "}
          <Tri
            bm="Kembali ke senarai pertubuhan"
            zh="返回组织列表"
            en="Back to organisations"
          />
        </Link>
      </Button>

      <h1 className="mb-1 text-3xl font-semibold tracking-tight">
        <span className="v2-gradient-text">
          <Tri
            bm="Cipta pertubuhan baharu"
            zh="创建新组织"
            en="Create a new organisation"
          />
        </span>
      </h1>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">
            <Tri
              bm="Butiran pertubuhan"
              zh="组织资料"
              en="Organisation details"
            />
          </CardTitle>
          <CardDescription>
            <Tri
              bm="Untuk cawangan, pilih pertubuhan induk (hanya hq_admin)"
              zh="要创建分会，请选择上级组织（仅限总部管理员）"
              en="For a branch, pick the parent organisation (hq_admin only)"
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm parentChoices={parentChoices} />
        </CardContent>
      </Card>
    </div>
  );
}
