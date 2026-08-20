import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg, getMemberships } from "@/lib/active-org";
import { usageMonthUtcWindow } from "@/lib/ai/usage-core";
import { OrgList, type OrgListItem } from "./org-list";

// /orgs — list every organisation the user can see (their own orgs plus,
// for HQ roles, every branch below), switch the active one, search the list.
// All reads go through the user-scoped client: RLS decides what appears.
//
// 2026-07-28 — creating an org moved to its own page (/orgs/new). The form used
// to sit below every card, so the main action was the last thing you could
// reach. The button now sits beside the heading; the cards + search box live in
// ./org-list.tsx because searching needs client state.
export const dynamic = "force-dynamic";

type OrgRow = {
  id: number;
  name: string;
  parent_org_id: number | null;
  is_demo: boolean;
  monthly_free_quota: number;
  extra_credits: number;
};

export default async function OrgsPage() {
  const supabase = await getSupabaseServer();
  const [active, memberships, orgsRes, adminRes] = await Promise.all([
    getActiveOrg(),
    getMemberships(),
    supabase
      .from("orgs")
      .select("id, name, parent_org_id, is_demo, monthly_free_quota, extra_credits")
      .order("parent_org_id", { ascending: true, nullsFirst: true })
      .order("name"),
    supabase.rpc("accessible_orgs_admin"),
  ]);

  const orgs = (orgsRes.data ?? []) as OrgRow[];

  // Phase 7.5a: this month's AI usage per visible org (RLS-scoped read),
  // shown next to the admin-only credit top-up.
  const { startUtc, endUtc } = usageMonthUtcWindow(new Date());
  const usageRes = await supabase
    .from("ai_usage")
    .select("org_id")
    .gte("created_at", startUtc)
    .lt("created_at", endUtc)
    .limit(10000);
  const usedByOrg = new Map<number, number>();
  for (const row of (usageRes.data ?? []) as { org_id: number }[]) {
    usedByOrg.set(row.org_id, (usedByOrg.get(row.org_id) ?? 0) + 1);
  }
  const directRoles = new Map(memberships.map((m) => [m.org.id, m.role]));
  const adminIds = new Set<number>(
    ((adminRes.data as unknown[]) ?? []).map((v) =>
      typeof v === "number"
        ? v
        : Number(Object.values(v as Record<string, unknown>)[0]),
    ),
  );
  const orgNames = new Map(orgs.map((o) => [o.id, o.name]));

  const items: OrgListItem[] = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    parentId: org.parent_org_id,
    parentName:
      org.parent_org_id !== null
        ? (orgNames.get(org.parent_org_id) ?? null)
        : null,
    isDemo: org.is_demo,
    isActive: active?.id === org.id,
    role: directRoles.get(org.id) ?? null,
    isAdmin: adminIds.has(org.id),
    extraCredits: org.extra_credits,
    monthlyFreeQuota: org.monthly_free_quota,
    usedThisMonth: usedByOrg.get(org.id) ?? 0,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl pb-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Pertubuhan" zh="组织" en="Organisations" />
          </span>
        </h1>
        <Button asChild size="lg">
          <Link href="/orgs/new">
            +{" "}
            <Tri
              bm="Cipta pertubuhan baharu"
              zh="创建新组织"
              en="Create a new organisation"
            />
          </Link>
        </Button>
      </div>

      {/* 2026-07-29 — the pilot user's words were "I don't even understand what
          this is, let alone anyone else". A list of cards with no sentence
          explaining the page leaves the reader to infer the whole org model
          from badges. One plain sentence, above the list. */}
      {orgs.length > 0 && (
        <p className="mb-5 max-w-prose text-sm leading-relaxed text-muted-foreground">
          <Tri
            bm="Di sini semua pertubuhan yang anda ada akses. Satu induk boleh ada cawangan di bawahnya. Minit hanya bekerja pada SATU pertubuhan pada satu masa — yang bertanda “Sedang guna”. Tekan “Tukar ke sini” untuk bertukar."
            zh="这里是您有权限的所有机构。一个总部底下可以有分会。Minit 一次只在「一个」机构里工作 —— 就是标着「正在用」的那一个。要换，按「切换到这里」。"
            en="Everything you have access to. A head office can have branches under it. Minit works in ONE organisation at a time — the one marked “In use”. Press “Switch to this” to change it."
          />
        </p>
      )}

      {orgs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Tri
                bm="Anda belum menyertai mana-mana pertubuhan"
                zh="您还没有加入任何组织"
                en="You are not part of any organisation yet"
              />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Tekan butang di atas untuk mencipta satu. (Kalau pertubuhan anda sudah ada di Minit, minta orang yang menguruskannya menambah anda — buat masa ini itu perlu dilakukan oleh mereka.)"
                zh="点上面的按钮创建一个，或请管理员把您加进去"
                en="Use the button above to create one. (If your organisation is already on Minit, ask whoever manages it to add you — for now that has to be done by them.)"
              />
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <OrgList orgs={items} />
      )}
    </div>
  );
}
