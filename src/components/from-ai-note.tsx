"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// F-6 (work order 31, J's old #16): when the assistant's answer button lands
// someone on an action page (`?dari=ai` — withAiMarker in ask-routes.ts), the
// page opens with one orienting line: "the AI sent you here — this is where
// you do it". Without it, a 60-year-old who tapped a button in a chat finds
// themselves on a page they have never seen, with no idea why.
//
// Render nothing at all when the marker is absent: regular navigation must
// look exactly as before.
// ---------------------------------------------------------------------------

function FromAiNoteInner({ bm, zh, en }: { bm: string; zh: string; en: string }) {
  const params = useSearchParams();
  if (params.get("dari") !== "ai") return null;
  return (
    <p className="mb-4 rounded-md border-2 border-[#a855f7]/40 bg-[#a855f7]/10 px-4 py-3 text-base">
      ✨{" "}
      <Tri
        bm={`Anda datang dari jawapan AI: ${bm}`}
        zh={`从 AI 那边过来的：${zh}`}
        en={`You came from an AI answer: ${en}`}
      />
    </p>
  );
}

/** Drop at the top of an action page. `bm/zh/en` finish the sentence:
 *  "从 AI 那边过来的：<在这里把活动加进日历。>" */
export function FromAiNote(props: { bm: string; zh: string; en: string }) {
  // useSearchParams needs a Suspense boundary in a server-rendered tree.
  return (
    <Suspense fallback={null}>
      <FromAiNoteInner {...props} />
    </Suspense>
  );
}
