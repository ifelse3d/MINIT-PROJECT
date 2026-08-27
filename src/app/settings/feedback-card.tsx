"use client";

// K-1 (work order 27): "report a problem" — a small free-text form. Free,
// no AI involved, and the form says so. See feedback-actions.ts.

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { SettingsBlock } from "./ui";
import { submitFeedback } from "./feedback-actions";

export function FeedbackCard() {
  const t = useTriText();
  const pathname = usePathname();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"sent" | "error" | null>(null);

  async function send() {
    if (busy || message.trim() === "") return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await submitFeedback({ message, page: pathname ?? "" });
      if (result.ok) {
        setMessage("");
        setNotice("sent");
      } else {
        setNotice("error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsBlock>
      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold">
          <Tri bm="Lapor masalah / beri cadangan" zh="回报问题 / 提建议" en="Report a problem / suggest" />
        </p>
        <p className="text-sm text-muted-foreground">
          <Tri
            bm="Terus kepada orang yang membina MinitAI. Percuma — tiada AI terlibat, tiada kuota digunakan."
            zh="直接送到做 MinitAI 的人手上。免费 —— 不经 AI、不用额度。"
            en="Goes straight to the people building MinitAI. Free — no AI involved, no quota used."
          />
        </p>
        <textarea
          value={message}
          rows={3}
          maxLength={4000}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t(
            "Apa yang tidak kena, atau apa yang anda mahu ada?",
            "哪里不对，或想要什么功能？",
            "What went wrong, or what do you wish existed?",
          )}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void send()} disabled={busy || message.trim() === ""}>
            {busy ? <Tri bm="Menghantar…" zh="发送中…" en="Sending…" /> : <Tri bm="Hantar" zh="送出" en="Send" />}
          </Button>
          {notice === "sent" && (
            <span className="text-sm font-medium text-green-800 dark:text-green-300">
              ✓ <Tri bm="Diterima — terima kasih." zh="收到了 —— 谢谢。" en="Received — thank you." />
            </span>
          )}
          {notice === "error" && (
            <span className="text-sm font-medium text-red-700 dark:text-red-300">
              <Tri
                bm="Tidak berjaya dihantar — cuba sebentar lagi."
                zh="没送出去 —— 请稍后再试。"
                en="Could not send — try again shortly."
              />
            </span>
          )}
        </div>
      </div>
    </SettingsBlock>
  );
}
