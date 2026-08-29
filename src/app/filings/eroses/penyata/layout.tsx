import { Suspense } from "react";
import { Tri } from "@/components/language-provider";
import { LangkahRail } from "./flow-ui";

// The Penyata Tahunan FLOW — a folder of routes (Hard Rule 13): the start
// page picks the meeting, then /langkah/1 … /langkah/9 are one page per
// portal step, with this layout holding the heading and the step rail.
// Shared state lives in the URL (?doc/?dari/?hingga), so a refresh or a
// shared link lands exactly where you were.

export default function PenyataFlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri
              bm="Penyata Tahunan eROSES"
              zh="eROSES 年度呈报"
              en="eROSES Annual Return"
            />
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Buka eROSES di tab lain: Pertubuhan → Penyata Tahunan → Tambah. Rel di sana bernama “Langkah penyata tahunan” — rel di bawah mengikutnya satu-satu, satu langkah satu halaman."
            zh="在另一个浏览器分页打开 eROSES：Pertubuhan → Penyata Tahunan → Tambah。那边的进度栏叫「Langkah penyata tahunan」—— 下面这条就是照着它排的，一步一页。"
            en="Open eROSES in another tab: Pertubuhan → Penyata Tahunan → Tambah. Its rail is called “Langkah penyata tahunan” — the rail below follows it, one step per page."
          />
        </p>
      </div>
      <Suspense fallback={null}>
        <LangkahRail />
      </Suspense>
      {children}
    </div>
  );
}
