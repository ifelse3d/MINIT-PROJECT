"use client";

// ---------------------------------------------------------------------------
// e-Invois visibility (R-6, 2026-08-25). J 2026-08-24: e-Invois is OPTIONAL —
// most societies never need it; eROSES is the legal must. Default OFF.
//
// 0-4 (2026-08-25): the switch is the ORGANISATION's (orgs.needs_einvois,
// migration 20260829000000) — flipping it here changes what every member on
// every device sees. Only hq_admin can change it (RLS + the server action).
// When the organisation value cannot be read or written, the toggle degrades
// to the old device preference and SAYS so — silent desync is the worst kind
// of success (STATE §6).
// ---------------------------------------------------------------------------

import { Tri } from "@/components/language-provider";
import { useEinvoisVisible, useEinvoisSync } from "@/lib/einvois-pref";
import { SettingsRow } from "./ui";

export function EinvoisRows() {
  const [visible, setVisible] = useEinvoisVisible();
  const { orgBacked, saveError } = useEinvoisSync();
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
      <div className="flex flex-col gap-2">
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
        {orgBacked ? (
          <p className="text-sm text-muted-foreground">
            <Tri
              bm="Tetapan ini milik pertubuhan — semua ahli di semua peranti nampak yang sama. Hanya pentadbir boleh mengubahnya."
              zh="这是机构的设置 —— 所有成员在任何设备上看到的都一样。只有管理员能改。"
              en="This setting belongs to the organisation — every member sees the same on every device. Only an administrator can change it."
            />
          </p>
        ) : (
          /* Degraded to device-only: say so, never desync silently. */
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            <Tri
              bm="Pilihan ini hanya tersimpan pada PERANTI INI buat masa ini — ahli lain tidak nampak. Ia berpindah ke pertubuhan apabila sambungan pulih."
              zh="这个选择目前只存在这台设备上 —— 其他成员看不到。等连线恢复会改成跟着机构走。"
              en="For now this choice lives on THIS DEVICE only — other members will not see it. It moves to the organisation once the connection is back."
            />
          </p>
        )}
        {saveError && (
          <p className="text-sm font-medium text-red-700 dark:text-red-300" role="alert">
            {saveError}
          </p>
        )}
      </div>
    </SettingsRow>
  );
}
