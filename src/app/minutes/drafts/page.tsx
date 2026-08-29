import Link from "next/link";
import { Tri } from "@/components/language-provider";
import { getActiveOrg } from "@/lib/active-org";
import { listDrafts } from "../draft-actions";
import { DraftsList } from "./drafts-list";

// /minutes/drafts — every unfinished cloud draft, on its own address
// (§1-15a, work order 69; Hard Rule 13). The workspace shows only the two
// most recent — the long tail lives here, sorted by last update
// (listDrafts orders updated_at desc). Fail-open: before migration 33 the
// list is simply empty.

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const active = await getActiveOrg().catch(() => null);
  if (!active) {
    return (
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
    );
  }
  const drafts = await listDrafts();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">
        ☁️{" "}
        <Tri bm="Draf belum siap" zh="未完成草稿" en="Unfinished drafts" />
      </h2>
      <DraftsList drafts={drafts} />
    </div>
  );
}
