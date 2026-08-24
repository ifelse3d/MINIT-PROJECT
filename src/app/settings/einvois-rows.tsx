"use client";

// ---------------------------------------------------------------------------
// e-Invois visibility (R-6, 2026-08-25). J 2026-08-24: e-Invois is OPTIONAL —
// most societies never need it; eROSES is the legal must. Default OFF. This
// toggle currently stores a device preference (src/lib/einvois-pref.ts); the
// organisation-level switch is migration 20260829000000 (orgs.needs_einvois),
// to be wired once applied.
// ---------------------------------------------------------------------------

import { Tri } from "@/components/language-provider";
import { useEinvoisVisible } from "@/lib/einvois-pref";
import { SettingsRow } from "./ui";

export function EinvoisRows() {
  const [visible, setVisible] = useEinvoisVisible();
  return (
    <SettingsRow
      label={<Tri bm="e-Invois (LHDN)" zh="电子发票 e-Invois（LHDN）" en="e-Invois (LHDN)" />}
      help={
        <Tri
          bm="Kebanyakan persatuan TIDAK perlu e-Invois — eROSES ialah kewajipan undang-undang, e-Invois hanya untuk pertubuhan yang perlu memfailkan cukai. Hidupkan hanya jika bendahari anda tahu ia perlu. Amaran RM10,000 untuk derma besar sentiasa aktif."
          zh="大多数社团「不需要」e-Invois —— eROSES 才是法定必须的；e-Invois 只给需要报税的机构用。财政确定需要才打开。单笔超过 RM10,000 的提醒不管开不开都会有。"
          en="Most societies do NOT need e-Invois — eROSES is the legal requirement; e-Invois is only for organisations that must file tax. Turn it on only if your treasurer knows it is needed. The RM10,000 large-donation warning stays on regardless."
        />
      }
    >
      <label className="flex items-center gap-3 text-base">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
          className="h-5 w-5 accent-[color:var(--v2-primary)]"
        />
        <Tri
          bm="Tunjukkan halaman fail cukai e-Invois"
          zh="显示 e-Invois 税务文件页面"
          en="Show the e-Invois tax file page"
        />
      </label>
    </SettingsRow>
  );
}
