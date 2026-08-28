"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { chooseReceiptPrefix } from "./actions";
import { useRegister } from "./register-store";

// ---------------------------------------------------------------------------
// THE ISSUE-RECEIPTS CONTROL — button, irreversibility confirm, the
// receipt-letters dialog and every outcome notice, as ONE component.
//
// Extracted from register-receipts.tsx for J's launch feedback #3
// (2026-08-27 evening): the flow now issues receipts for THIS ROUND on its
// own page (/money/issue), while the receipts page keeps issuing for the
// whole register or a hand-picked selection. Same store call, same dialogs —
// one copy, so the two doors can never drift apart.
//
// `ids` narrows the issue to those rows; absent = every unreceipted row.
// ---------------------------------------------------------------------------

export function IssueControls({
  ids,
  count,
  size = "lg",
}: {
  /** Limit issuing to these register rows (#3: the round / a selection). */
  ids?: string[];
  /** How many unreceipted rows the button covers (shown on the button). */
  count: number;
  size?: "lg" | "default";
}) {
  const t = useTriText();
  const {
    issueReceipts,
    issueBusy,
    issueNotice,
    setIssueNotice,
    issueFenceMessage,
  } = useRegister();

  const [confirmIssue, setConfirmIssue] = useState(false);
  // B-4①: the receipt-letters dialog (issueNotice === "needs_prefix").
  const [prefixInput, setPrefixInput] = useState("");
  const [prefixBusy, setPrefixBusy] = useState(false);
  const [prefixError, setPrefixError] = useState<string | null>(null);

  return (
    <>
      {count > 0 && (
        <Button
          onClick={() => setConfirmIssue(true)}
          size={size}
          className="text-base"
          disabled={issueBusy}
        >
          {issueBusy ? (
            <Tri bm="Menjana…" zh="生成中…" en="Issuing…" />
          ) : (
            <Tri
              bm={`Jana resit berurutan (${count})`}
              zh={`生成正式收据（${count} 笔）`}
              en={`Issue receipts (${count})`}
            />
          )}
        </Button>
      )}

      {/* B-4② (J #15): ONE clear dialog — numbers are legal, non-reusable. */}
      {confirmIssue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex w-full max-w-md flex-col gap-3 rounded-md border bg-background p-5 shadow-xl">
            <p className="text-lg font-semibold">
              <Tri
                bm={`Jana resit untuk ${count} derma?`}
                zh={`要为 ${count} 笔捐款生成收据吗？`}
                en={`Issue receipts for ${count} donation(s)?`}
              />
            </p>
            <p className="text-base text-muted-foreground">
              <Tri
                bm="Setiap resit dapat nombor berurutan yang kekal. Selepas ini nombor tidak boleh dibatalkan atau diubah, dan jumlah wang dikunci untuk audit."
                zh="每张收据会拿到一个永久的顺序编号。生成之后编号无法取消或修改，金额也会锁定以供审计。"
                en="Each receipt gets a permanent sequential number. Afterwards the numbers cannot be cancelled or changed, and the amounts are locked for the audit trail."
              />
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="lg"
                variant="outline"
                className="text-base"
                disabled={issueBusy}
                onClick={() => setConfirmIssue(false)}
              >
                <Tri bm="Batal" zh="取消" en="Cancel" />
              </Button>
              <Button
                size="lg"
                className="text-base"
                disabled={issueBusy}
                onClick={() => {
                  setConfirmIssue(false);
                  void issueReceipts({ ids });
                }}
              >
                <Tri bm="Ya, jana resit" zh="是，生成收据" en="Yes, issue receipts" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {issueNotice === "saved" && (
        <div className="flex flex-col gap-1.5 rounded-md border-2 border-green-400 bg-green-50 p-3 text-base text-green-900 dark:bg-green-400/10 dark:text-green-100">
          <p className="font-medium">
            ✓{" "}
            <Tri
              bm="Resit disimpan ke sejarah pertubuhan"
              zh="收据已保存到组织历史"
              en="Receipts saved to the organisation's history"
            />
          </p>
          <p className="text-sm">
            <Tri
              bm="Setiap baris di bawah kini ada butang “Muat turun resit” dan “Hantar WhatsApp” untuk penderma itu."
              zh="下面每一笔都有「下载收据」和「用 WhatsApp 发送」按钮，可以发给捐款人。"
              en="Every row below now has “Download receipt” and “Send on WhatsApp” for that donor."
            />
          </p>
        </div>
      )}
      {issueNotice === "local" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Tri
            bm="Mod demo: nombor dijana setempat sahaja — TIDAK disimpan. Pilih pertubuhan di halaman Pertubuhan untuk menyimpan."
            zh="演示模式：编号仅在本机生成——未保存。请在组织页面选择组织以保存。"
            en="Demo mode: numbers issued locally only — NOT saved. Choose an organisation on the Organisations page to save."
          />
        </p>
      )}
      {issueNotice === "readonly" && (
        <p className="rounded-md border-2 border-slate-300 bg-slate-50 p-3 text-base font-medium text-slate-800 dark:bg-white/10 dark:text-slate-100">
          <Tri
            bm="Peranan anda tidak boleh menjana resit — itu tugas bendahari atau pentadbir. Minta mereka melakukannya."
            zh="您的角色不能开收据 —— 开收据是财政或管理员的事，请找他们处理。"
            en="Your role cannot issue receipts — that is the treasurer's or an administrator's job. Ask them to do it."
          />
        </p>
      )}
      {/* B-4① (J #12): the receipt-letters choice happens HERE, in one
          dialog — no more trip to Settings that testers never came back
          from. Explains what the letters ARE, takes the letters, done. */}
      {issueNotice === "needs_prefix" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-md border bg-background p-5 shadow-xl">
            <p className="text-lg font-semibold">
              <Tri
                bm="Sebelum resit pertama: pilih huruf resit anda"
                zh="开第一张收据之前：先选收据字母"
                en="Before the first receipt: choose your receipt letters"
              />
            </p>
            <p className="text-base text-muted-foreground">
              <Tri
                bm="Huruf ini ialah PANGKAL nombor resit — contoh: huruf PSH memberi resit PSH-2026-0001. Setiap cawangan perlu huruf sendiri supaya resit menunjukkan siapa yang mengeluarkannya. Selepas resit pertama dikeluarkan, huruf itu dikunci dan tidak boleh diubah lagi."
                zh="这组字母是收据编号的开头 —— 例如选 PSH，收据就是 PSH-2026-0001。每个分会要有自己的字母，收据才看得出是谁开的。开出第一张之后，字母就锁定，不能再改。"
                en="These letters are the START of every receipt number — e.g. choosing PSH gives PSH-2026-0001. Each branch needs its own letters so a receipt shows who issued it. After the first receipt they are locked and cannot change."
              />
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                <Tri
                  bm="Huruf anda (2–8 huruf/angka)"
                  zh="您的字母（2–8 个字母或数字）"
                  en="Your letters (2–8 letters/digits)"
                />
              </span>
              <input
                value={prefixInput}
                onChange={(e) => {
                  setPrefixInput(e.target.value.toUpperCase());
                  setPrefixError(null);
                }}
                placeholder="PSH"
                maxLength={8}
                className="w-40 rounded-md border border-input bg-background px-3 py-2 font-mono text-lg uppercase shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            {prefixInput && (
              <p className="text-sm text-muted-foreground">
                <Tri bm="Contoh resit" zh="收据示例" en="Example receipt" />:{" "}
                <span className="font-mono">
                  {prefixInput}-{new Date().getFullYear()}-0001
                </span>
              </p>
            )}
            {prefixError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                {prefixError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="lg"
                variant="ghost"
                className="text-base"
                disabled={prefixBusy}
                onClick={() => {
                  setIssueNotice(null);
                  setPrefixError(null);
                }}
              >
                <Tri bm="Nanti dahulu" zh="先不要" en="Not now" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-base"
                disabled={issueBusy || prefixBusy}
                onClick={() => void issueReceipts({ acceptDefaultPrefix: true, ids })}
              >
                <Tri bm="Guna 'MIN' sahaja" zh="就用 MIN 继续" en="Continue with 'MIN'" />
              </Button>
              <Button
                size="lg"
                className="text-base"
                disabled={prefixBusy || prefixInput.trim() === ""}
                onClick={() => {
                  void (async () => {
                    setPrefixBusy(true);
                    setPrefixError(null);
                    try {
                      const result = await chooseReceiptPrefix(prefixInput);
                      if (result.ok) {
                        setIssueNotice(null);
                        // The prefix is set — issue with the letters chosen.
                        await issueReceipts({ ids });
                        return;
                      }
                      setPrefixError(
                        result.reason === "invalid"
                          ? t(
                              "Huruf tidak sah — mula dengan huruf, 2 hingga 8 huruf/angka. Contoh: PSH, KLG2.",
                              "字母无效 —— 要以字母开头，共 2 到 8 个字母或数字。例如：PSH、KLG2。",
                              "Not valid — start with a letter, 2 to 8 letters/digits. Examples: PSH, KLG2.",
                            )
                          : result.reason === "not_admin"
                            ? t(
                                "Hanya pentadbir pertubuhan boleh menetapkan huruf ini. Minta pentadbir membuatnya di Tetapan — atau teruskan dengan 'MIN'.",
                                "只有机构管理员能设定这组字母。请管理员在设置里设定 —— 或者先用 MIN 继续。",
                                "Only an organisation admin can set these letters. Ask an admin to set them in Settings — or continue with 'MIN'.",
                              )
                            : result.reason === "frozen"
                              ? t(
                                  "Resit sudah wujud, jadi huruf telah dikunci.",
                                  "已经开过收据，字母已锁定。",
                                  "Receipts already exist, so the letters are locked.",
                                )
                              : t(
                                  "Tidak berjaya disimpan. Cuba lagi.",
                                  "没能保存，请再试一次。",
                                  "Could not be saved. Try again.",
                                ),
                      );
                    } finally {
                      setPrefixBusy(false);
                    }
                  })();
                }}
              >
                {prefixBusy ? (
                  <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
                ) : (
                  <Tri
                    bm="Guna huruf ini & jana resit"
                    zh="用这组字母开收据"
                    en="Use these letters & issue"
                  />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
      {issueNotice === "sample" && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Ada baris CONTOH dalam daftar — resit tidak dijana dan tiada apa-apa disimpan. Nombor resit sebenar tidak boleh digunakan untuk derma rekaan. Padam baris contoh itu dahulu, kemudian cuba lagi."
            zh="登记簿里有示范用的记录——收据没有生成，也没有写入任何东西。真实的收据号码不能用在虚构的捐款上。请先删掉那些示范记录，再试一次。"
            en="The register contains SAMPLE rows — no receipts were issued and nothing was saved. Real receipt numbers cannot be spent on fictional donations. Delete the sample rows first, then try again."
          />
        </p>
      )}
      {issueNotice === "db_behind" && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Daftar ini ada derma barangan, tetapi pangkalan data belum dikemas kini untuknya (migration 25). Tiada resit dijana dan tiada apa-apa hilang — baris menunggu dengan selamat. Minta pentadbir sistem jalankan migration itu, kemudian cuba lagi."
            zh="登记簿里有实物捐赠，但数据库还没更新到支持它（migration 25）。收据没有生成，东西也不会丢 —— 记录安全地等着。请系统管理员跑完那支 migration 再试一次。"
            en="The register contains an in-kind donation, but the database has not been updated for it yet (migration 25). No receipts were issued and nothing is lost — the rows wait safely. Ask whoever runs the system to apply that migration, then try again."
          />
        </p>
      )}
      {issueNotice === "fence" && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          {/* D44: the server's ready trilingual sentence — limit + upgrade
              path. Nothing was written; the rows wait safely. */}
          {issueFenceMessage ?? (
            <Tri
              bm="Had resit pelan percuma sudah digunakan. Naik taraf di Tetapan → Pelan."
              zh="免费版的收据额度已用完。请到 设置 → 订阅方案 升级。"
              en="The free plan's receipt allowance is used up. Upgrade under Settings → Plan."
            />
          )}
        </p>
      )}
      {issueNotice === "error" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {/* issue_receipts() is one DB transaction (2026-08-25): a failure
              writes nothing, so trying again is safe — say so instead of the
              old "we cannot tell what happened" alarm. */}
          <Tri
            bm="Resit tidak dijana — tiada apa-apa disimpan. Sila cuba sekali lagi. Jika masih gagal, semak “Sejarah resit”."
            zh="收据没有生成——什么都没有写入。请再试一次；若还是失败，请看「收据历史」。"
            en="The receipts were not issued — nothing was saved. Please try again; if it keeps failing, check “Receipt history”."
          />
        </p>
      )}
    </>
  );
}
