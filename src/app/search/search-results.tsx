"use client";

import { MINUTES_STATUS_LABEL, labelFor } from "@/lib/status-labels";
import { scopedKey } from "@/lib/storage-scope-core";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri, useTriText } from "@/components/language-provider";
import {
  filterClauses,
  type ClauseMatch,
  type ConfirmedClause,
} from "@/lib/constitution";
import { maskName } from "@/lib/mask";
import { formatRm } from "@/lib/minutes-draft";
import type { RegisterDonation } from "@/lib/receipts";

// ---------------------------------------------------------------------------
// Search results (client half of /search). Adds the LOCAL sources on top of
// the server's DB hits: the register saved in this browser (same localStorage
// key the /money page uses) and the constitution clauses (same data +
// filterClauses the /constitution page uses). PDPA: donor names are masked.
// Pure keyword matching — no AI, no chatbot.
// ---------------------------------------------------------------------------

export type DbReceiptHit = {
  id: number;
  receiptNo: string;
  donorMasked: string;
  amountCents: number;
  purpose: string;
  dateIso: string;
};

export type DbMinutesHit = {
  id: number;
  meetingType: string;
  meetingDate: string;
  status: string;
};

/**
 * The clauses this device has actually read, written by /constitution.
 * Same key and shape; kept deliberately tolerant because a corrupt or absent
 * blob must mean "no clauses", never a crash and never the fictional example.
 */
function loadOwnClauses(): ConfirmedClause[] {
  try {
    // S0-4: scoped per user+org, matching /constitution's own store.
    const raw = localStorage.getItem(scopedKey("constitution:v1"));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { clauses?: unknown };
    if (!Array.isArray(parsed.clauses)) return [];
    return parsed.clauses.filter((c): c is ConfirmedClause => {
      if (typeof c !== "object" || c === null) return false;
      const x = c as Record<string, unknown>;
      return (
        typeof x.clause_no === "string" &&
        typeof x.heading === "string" &&
        typeof x.text === "string" &&
        typeof x.page_ref === "string"
      );
    });
  } catch {
    return [];
  }
}

type LocalDonationHit = {
  donorMasked: string;
  amountCents: number;
  purpose: string;
  dateIso: string;
  receiptNo: string | null;
};

export function SearchResults({
  query,
  dbReceipts,
  dbMinutes,
}: {
  query: string;
  dbReceipts: DbReceiptHit[];
  dbMinutes: DbMinutesHit[];
}) {
  const t = useTriText();
  const [localDonations, setLocalDonations] = useState<LocalDonationHit[]>([]);
  const [clauses, setClauses] = useState<ClauseMatch[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!query) {
      setLocalDonations([]);
      setClauses([]);
      setReady(true);
      return;
    }
    const ql = query.toLowerCase();
    // Same store /money uses (usePersistentState key).
    try {
      const raw = window.localStorage.getItem(scopedKey("money:donations:v1"));
      const donations = raw ? (JSON.parse(raw) as RegisterDonation[]) : [];
      setLocalDonations(
        donations
          .filter((d) =>
            [d.donorName, d.purpose, d.receiptNo ?? "", d.donatedAtIso]
              .join(" ")
              .toLowerCase()
              .includes(ql),
          )
          .slice(0, 20)
          .map((d) => ({
            donorMasked: maskName(d.donorName),
            amountCents: d.amountCents,
            purpose: d.purpose,
            dateIso: d.donatedAtIso,
            receiptNo: d.receiptNo,
          })),
      );
    } catch {
      setLocalDonations([]);
    }
    // Same matcher the /constitution page uses, over the SAME source: the
    // clauses read off this device's own constitution.
    //
    // 2026-07-28 — this used to search `sampleClauses`, the FICTIONAL
    // constitution. Someone searching "kuorum" got a confident clause quote out
    // of an invented document sitting next to their real receipts and minutes.
    // No constitution photographed yet = no clause hits, which is the truth.
    setClauses(filterClauses(query, loadOwnClauses()));
    setReady(true);
  }, [query]);

  const totalHits =
    dbReceipts.length + dbMinutes.length + localDonations.length + clauses.length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Carian" zh="搜索" en="Search" />
          </span>
        </h1>
        <p className="text-muted-foreground">
          {query ? (
            <>
              “{query}” ·{" "}
              <Tri bm="carian kata kunci rekod" zh="记录关键词搜索" en="keyword search of your records" />
            </>
          ) : (
            <Tri
              bm="Taip kata kunci di bar carian di atas"
              zh="请在上方搜索栏输入关键词"
              en="Type a keyword in the search bar above"
            />
          )}
        </p>
      </div>

      {query && ready && totalHits === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Tri bm="Tiada padanan" zh="没有结果" en="No results" />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Untuk soalan (cth. “bila AGM perlu diadakan?”), guna Tanya Minit."
                zh="如果是问题（例如“AGM 何时召开？”），请使用 Tanya Minit。"
                en="For question-style queries (e.g. “when must the AGM be held?”), use Tanya Minit."
              />
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {(dbMinutes.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              📝 <Tri bm="Minit" zh="会议记录" en="Minutes" />{" "}
              <Badge variant="secondary">{dbMinutes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dbMinutes.map((m) => (
              <Link
                key={m.id}
                href="/minutes/history"
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/40"
              >
                <span className="font-medium">{m.meetingType || t("Mesyuarat", "会议", "Meeting")}</span>
                <span className="text-muted-foreground">{m.meetingDate}</span>
                <Badge variant="outline">
                  {/* Was the raw enum "confirmed". */}
                  <Tri {...labelFor(MINUTES_STATUS_LABEL, m.status)} />
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {(dbReceipts.length > 0 || localDonations.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              🧾 <Tri bm="Resit & daftar derma" zh="收据与捐款登记" en="Receipts & register" />{" "}
              <Badge variant="secondary">{dbReceipts.length + localDonations.length}</Badge>
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Nama penderma disorok untuk melindungi privasi mereka"
                zh="为保护捐款人隐私，姓名已隐藏"
                en="Donor names are hidden to protect their privacy"
              />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dbReceipts.map((r) => (
              <Link
                key={`db-${r.id}`}
                href={`/money/history#receipt-${r.id}`}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/40"
              >
                <span className="font-mono">{r.receiptNo}</span>
                <span>{r.donorMasked}</span>
                <span className="tabular-nums font-medium">{formatRm(r.amountCents)}</span>
                <span className="text-muted-foreground">{r.purpose}</span>
                <span className="text-muted-foreground">{r.dateIso}</span>
              </Link>
            ))}
            {localDonations.map((d, i) => (
              <Link
                key={`local-${i}`}
                href="/money"
                className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/40"
              >
                <span className="font-mono">
                  {d.receiptNo ?? t("belum ada resit", "还没有收据", "no receipt yet")}
                </span>
                <span>{d.donorMasked}</span>
                <span className="tabular-nums font-medium">{formatRm(d.amountCents)}</span>
                <span className="text-muted-foreground">{d.purpose}</span>
                <span className="text-muted-foreground">{d.dateIso}</span>
                <Badge variant="outline">
                  <Tri bm="pelayar ini" zh="本浏览器" en="this browser" />
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {clauses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {/* The "Sample data" badge is gone with the sample: these hits
                  now come from the person's own photographed constitution. */}
              📜 <Tri bm="Fasal" zh="章程条款" en="Clauses" />{" "}
              <Badge variant="secondary">{clauses.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {clauses.map((m) => (
              <Link
                key={m.clause.clause_no}
                href={`/constitution?q=${encodeURIComponent(query)}`}
                className="rounded-md border p-3 text-sm hover:bg-muted/40"
              >
                <span className="font-medium">
                  {m.clause.clause_no} · {m.clause.heading}
                </span>
                <p className="mt-1 line-clamp-2 text-muted-foreground">{m.clause.text}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
