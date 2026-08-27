import { UPLOAD_STATUS_LABEL, labelFor } from "@/lib/status-labels";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { formatMytDateTime } from "@/lib/history";

// /inbox — "Gambar asal / 原始照片 / Original photos": every document this org
// has photographed, newest first, with its processing status and a link to the
// image itself.
//
// RENAMED 2026-08-23 (J's UX list, D4: 「上传记录」放在文件底下，看的人不懂那是
// 什么). "Upload records" described the MECHANISM — that a file was uploaded —
// which is the one thing the reader does not care about. What is actually here
// is the photograph behind every extracted field: the evidence you go and look
// at when a number on a receipt or a name in the minutes looks wrong. So it is
// called that, and the page now says so in a sentence rather than assuming.
//
// This page used to be the front door and carried a three-way "what did you
// photograph?" menu. Those choices now live on HOME, one click from the pages
// that actually own the camera, so nothing routes through here any more. What
// is left is a lookup surface, which is why it sits in the account menu next to
// History rather than in the sidebar.
//
// Reads through the user-scoped client: RLS decides what is visible. "View"
// links are short-lived signed URLs into the private uploads bucket.
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, { bm: string; zh: string; en: string }> = {
  meeting_notes: { bm: "Nota mesyuarat", zh: "会议记录", en: "Meeting notes" },
  ledger_page: { bm: "Lejar derma", zh: "捐款账页", en: "Ledger page" },
  constitution: { bm: "Perlembagaan", zh: "章程", en: "Constitution" },
  attendance_sheet: { bm: "Kehadiran", zh: "出席表", en: "Attendance" },
  expense: { bm: "Perbelanjaan", zh: "开支", en: "Expense" },
  other: { bm: "Lain-lain", zh: "其他", en: "Other" },
};

type UploadRow = {
  id: number;
  filename: string;
  storage_path: string | null;
  kind: string;
  status: string;
  uploaded_at: string;
  url: string | null;
};

export default async function InboxPage() {
  const active = await getActiveOrg();

  let rows: UploadRow[] = [];
  if (active) {
    const supabase = await getSupabaseServer();
    const { data: uploads } = await supabase
      .from("uploads")
      .select("id, filename, storage_path, kind, status, uploaded_at")
      .eq("org_id", active.id)
      .order("uploaded_at", { ascending: false })
      .limit(100);

    // Short-lived signed links into the PRIVATE bucket (1 hour).
    rows = await Promise.all(
      (uploads ?? []).map(async (u) => {
        let url: string | null = null;
        if (u.storage_path) {
          const { data } = await supabase.storage
            .from("uploads")
            .createSignedUrl(u.storage_path, 3600);
          url = data?.signedUrl ?? null;
        }
        return { ...u, url };
      }),
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-10">
      <h1 className="mb-1 text-3xl font-semibold tracking-tight">
        <span className="v2-gradient-text">
          <Tri bm="Gambar asal" zh="原始照片" en="Original photos" />
        </span>
      </h1>
      <p className="mb-1 text-base text-muted-foreground">
        <Tri
          bm="Setiap gambar yang pernah anda ambil untuk MinitAI. Buka mana-mana satu untuk melihat tulisan tangan asal di sebalik apa yang MinitAI baca."
          zh="您为 MinitAI 拍过的每一张照片。点开任何一张，就能看到 MinitAI 所读内容背后的原始手写字。"
          en="Every photo you have taken for MinitAI. Open any one to see the original handwriting behind what MinitAI read."
        />
      </p>
      <p className="mb-6 text-sm text-[color:var(--v2-text-soft)]">
        {active?.name}
      </p>

      {!active ? (
        <p className="text-muted-foreground">
          <Link href="/orgs" className="underline underline-offset-4">
            <Tri
              bm="Pilih atau cipta pertubuhan untuk melihat dokumen anda"
              zh="选择或创建组织后可查看您的文件"
              en="Choose or create an organisation to see your documents"
            />
          </Link>
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Tri bm="Belum ada muat naik" zh="还没有上传" en="No uploads yet" />
            </CardTitle>
            <CardDescription>
              <Link href="/" className="underline underline-offset-4">
                <Tri
                  bm="Ambil gambar dari halaman Utama"
                  zh="从主页拍照开始"
                  en="Start from Home with a photo"
                />
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((u) => {
            const kind = KIND_LABEL[u.kind] ?? KIND_LABEL.other;
            return (
              <Card key={u.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{u.filename}</CardTitle>
                      <CardDescription>
                        <Tri {...kind} /> ·{" "}
                        {/* P-3: fixed MYT, labelled. toLocaleString with no
                            timeZone used the SERVER's zone — UTC on Vercel,
                            8 hours behind every reader of this page. */}
                        {formatMytDateTime(u.uploaded_at)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          u.status === "done"
                            ? "bg-green-600 text-white hover:bg-green-600"
                            : "bg-amber-500 text-white hover:bg-amber-500"
                        }
                      >
                        {/* Was the raw enum: "done" / "processing". */}
                        <Tri {...labelFor(UPLOAD_STATUS_LABEL, u.status)} />
                      </Badge>
                      {u.url && (
                        <a
                          href={u.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm underline underline-offset-4"
                        >
                          <Tri bm="Lihat" zh="查看" en="View" />
                        </a>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="hidden" />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
