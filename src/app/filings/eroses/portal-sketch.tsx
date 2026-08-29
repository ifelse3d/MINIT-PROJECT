// §1-15b (work order 69, J: 新手看到 eROSES 就暈 — every step gets a
// "打開什麼→按哪裡→貼哪裡" picture where words alone don't stand up).
//
// These are INTERFACE-STYLE SKETCHES drawn from J's 17 portal screenshots:
// the same page structure — teal left checklist rail, card panes, labelled
// boxes — with ENTIRELY FICTIONAL content (Persatuan Contoh; J's real data
// appears nowhere, 拍板 A3/15b). Not screenshots, not pixel-accurate: enough
// shape that the person recognises the page when they see the real one.
//
// Server-renderable on purpose: no hooks, just markup. The portal's own BM
// labels stay BM (they are what the person must find on screen); the
// instruction chips are trilingual.

import { Tri } from "@/components/language-provider";

type BoxKind = "salin" | "sendiri" | "upload" | "tanda" | "auto";

type SketchBox = { label: string; value?: string; kind: BoxKind };

type Sketch = {
  /** The breadcrumb shown in the fake browser bar. */
  path: string;
  /** Which rail entry is highlighted; 0 = no rail (Pengurusan Mesyuarat). */
  railStep: number;
  /** A red PERINGATAN line, when the real page carries one. */
  peringatan?: string;
  paneTitle: string;
  boxes: SketchBox[];
  /** The go-do-it caption under the sketch: ① … ② … ③ …. */
  steps: { bm: string; zh: string; en: string };
};

const RAIL = [
  "Mesyuarat",
  "Maklumat Am",
  "Maklumat AJK",
  "Maklumat Juruaudit",
  "Penyata Kewangan",
  "Laporan Aktiviti",
  "Sumbangan Dari/Ke Luar Negara",
  "Paparan",
  "Pengakuan",
];

const KIND_CHIP: Record<BoxKind, { icon: string; bm: string; zh: string; en: string }> = {
  salin: { icon: "📋", bm: "salin dari bawah", zh: "从下面复制", en: "copy from below" },
  sendiri: { icon: "✍️", bm: "isi sendiri", zh: "自己填", en: "you fill in" },
  upload: { icon: "📎", bm: "muat naik fail", zh: "上传文件", en: "upload a file" },
  tanda: { icon: "☑️", bm: "baca & tanda", zh: "读了再勾", en: "read & tick" },
  auto: { icon: "🖥️", bm: "portal isi sendiri", zh: "portal 自动带出", en: "the portal fills it" },
};

const SKETCHES: Record<string, Sketch> = {
  mesyuarat: {
    path: "Pertubuhan → Pengurusan Mesyuarat → Tambah",
    railStep: 0,
    paneTitle: "Tambah Mesyuarat",
    boxes: [
      { label: "Jenis Mesyuarat*", value: "Mesyuarat Agung", kind: "salin" },
      { label: "Kaedah Mesyuarat*", value: "Bersemuka", kind: "sendiri" },
      { label: "Tujuan Mesyuarat*", value: "Mesyuarat Agung Tahunan", kind: "salin" },
      { label: "Tarikh Mesyuarat*", value: "15-03-2026", kind: "salin" },
      { label: "Masa*", value: "10:00 AM – 12:00 PM", kind: "sendiri" },
      { label: "Tempat / Alamat*", value: "Dewan Persatuan Contoh", kind: "salin" },
      { label: "Jumlah Kehadiran*", value: "42", kind: "salin" },
      { label: "Muat Naik Minit Mesyuarat*", kind: "upload" },
    ],
    steps: {
      bm: "① Log masuk eROSES → Pertubuhan → Pengurusan Mesyuarat. ② Tekan Tambah. ③ Salin nilai dari bawah ke kotak yang sama nama, muat naik PDF minit, kemudian Simpan.",
      zh: "① 登入 eROSES → Pertubuhan → Pengurusan Mesyuarat。② 按 Tambah。③ 把下面的值贴进同名的格子，上传会议记录 PDF，然后按 Simpan。",
      en: "① Log in to eROSES → Pertubuhan → Pengurusan Mesyuarat. ② Press Tambah. ③ Copy the values below into the same-named boxes, upload the minutes PDF, then Simpan.",
    },
  },
  "1": {
    path: "Pertubuhan → Penyata Tahunan → penyata-tahunan-agung",
    railStep: 1,
    peringatan:
      "Sila isi maklumat mesyuarat pembentangan penyata tahunan jika Jenis Mesyuarat tiada dalam pilihan…",
    paneTitle: "Maklumat Mesyuarat Penyata Tahunan",
    boxes: [
      { label: "Senarai Mesyuarat*", value: "Mesyuarat Agung (15-03-2026)", kind: "salin" },
      { label: "Kaedah Mesyuarat*", value: "—", kind: "sendiri" },
      { label: "Tujuan Mesyuarat*", value: "—", kind: "salin" },
      { label: "Tarikh Mesyuarat*", value: "15-03-2026", kind: "auto" },
      { label: "Masa*", value: "10:00 AM – 12:00 PM", kind: "sendiri" },
      { label: "Alamat Tempat Mesyuarat", value: "—", kind: "salin" },
      { label: "Jumlah Kehadiran*", value: "42", kind: "salin" },
      { label: "Muat Naik Minit Mesyuarat*", kind: "upload" },
    ],
    steps: {
      bm: "① Buka Pertubuhan → Penyata Tahunan → Tambah. ② Pilih mesyuarat anda dalam dropdown Senarai Mesyuarat (tiada? daftar dahulu di Pengurusan Mesyuarat — butang di bawah). ③ Salin nilai dari bawah, muat naik PDF minit, tekan Seterusnya.",
      zh: "① 打开 Pertubuhan → Penyata Tahunan → Tambah。② 在 Senarai Mesyuarat 下拉里选你们那场会（找不到？先去 Pengurusan Mesyuarat 登记 —— 下面有按钮）。③ 把下面的值贴过去，上传会议记录 PDF，按 Seterusnya。",
      en: "① Open Pertubuhan → Penyata Tahunan → Tambah. ② Pick your meeting in the Senarai Mesyuarat dropdown (not there? register it under Pengurusan Mesyuarat first — button below). ③ Copy the values below, upload the minutes PDF, press Seterusnya.",
    },
  },
  "2": {
    path: "…/penyata-tahunan-maklumat-am",
    railStep: 2,
    paneTitle: "Maklumat Am Pertubuhan",
    boxes: [
      { label: "Kategori Pertubuhan", value: "Kebajikan", kind: "auto" },
      { label: "No. Telefon*", value: "03-1234 5678", kind: "salin" },
      { label: "Tahun Kewangan Bermula*", value: "01-01", kind: "salin" },
      { label: "Bilangan Ahli Berdaftar*", value: "120", kind: "salin" },
      { label: "Bilangan Pemegang Jawatan*", value: "11", kind: "salin" },
      { label: "Bilangan Ahli Layak Mengundi*", value: "98", kind: "salin" },
      { label: "Bilangan Cawangan", value: "0", kind: "salin" },
      { label: "Maklumat Akaun Bank", value: "Bank Contoh · 1234567890", kind: "salin" },
    ],
    steps: {
      bm: "① Langkah Maklumat Am terbuka selepas langkah 1 disimpan. ② Salin setiap nilai dari bawah ke kotak sama nama. ③ Tekan Seterusnya.",
      zh: "① 第 1 步存档后就会进到 Maklumat Am。② 把下面每个值贴进同名的格子。③ 按 Seterusnya。",
      en: "① The Maklumat Am step opens once step 1 is saved. ② Copy each value below into the same-named box. ③ Press Seterusnya.",
    },
  },
  "3": {
    path: "…/penyata-tahunan-ajk",
    railStep: 3,
    peringatan: "Sila pastikan bilangan Ahli Jawatankuasa Biasa mengikut bilangan di dalam perlembagaan.",
    paneTitle: "Senarai AJK",
    boxes: [
      { label: "Senarai Perlantikan AJK*", value: "15-03-2026", kind: "salin" },
      { label: "Bilangan Ahli Jawatankuasa Terkini", value: "11 Orang", kind: "auto" },
      { label: "Jadual: Jawatan · Nama · E-mel · Negeri", value: "Pengerusi · TAN CONTOH · c@contoh.my · Selangor", kind: "auto" },
      { label: "Pengesahan Seksyen 9A", kind: "tanda" },
    ],
    steps: {
      bm: "① Portal menunjukkan AJK yang didaftarkan di AJK & Keahlian — kemas kini di SANA kalau senarai lama. ② Isi tarikh perlantikan (tarikh AGM). ③ Baca kotak Seksyen 9A, tanda, Seterusnya.",
      zh: "① 这页的名单来自 AJK & Keahlian 登记过的理事 —— 名单旧了要去那边改。② 填任命日期（就是 AGM 那天）。③ 读 Seksyen 9A 那段，勾了按 Seterusnya。",
      en: "① The list comes from what is registered under AJK & Keahlian — update it THERE if stale. ② Fill the appointment date (the AGM date). ③ Read the Seksyen 9A box, tick, Seterusnya.",
    },
  },
  "4": {
    path: "…/penyata-tahunan-juruaudit",
    railStep: 4,
    paneTitle: "Maklumat Juruaudit",
    boxes: [
      { label: "Tarikh Pelantikan Juruaudit*", value: "15-03-2026", kind: "salin" },
      { label: "Jadual: Nama · No. KP · E-mel · Status", value: "LIM CONTOH · (taip di portal) · Aktif", kind: "sendiri" },
    ],
    steps: {
      bm: "① Semak senarai juruaudit portal. ② Isi tarikh pelantikan; nombor IC ditaip terus di portal (MinitAI tidak menyimpannya). ③ Seterusnya.",
      zh: "① 对一眼 portal 的审计员名单。② 填任命日期；身份证号码直接在 portal 打（MinitAI 不保存）。③ Seterusnya。",
      en: "① Check the portal's auditors list. ② Fill the appointment date; IC numbers are typed straight into the portal (MinitAI never stores them). ③ Seterusnya.",
    },
  },
  "5": {
    path: "…/penyata-tahunan-pendapatan (muka 1/2)",
    railStep: 5,
    paneTitle: "Penyata Kewangan — Pendapatan & Perbelanjaan",
    boxes: [
      { label: "1.1 Yuran ahli (RM)", value: "2,400.00", kind: "salin" },
      { label: "1.1 Derma (RM)", value: "16,252.00", kind: "salin" },
      { label: "1.2 Aktiviti mengumpul dana (RM)", value: "0.00", kind: "salin" },
      { label: "Jumlah Pendapatan (RM)", value: "18,652.00", kind: "auto" },
      { label: "2.3 Utiliti (RM)", value: "1,180.00", kind: "salin" },
      { label: "Muka 2 → Perbelanjaan, kemudian Muat Naik Penyata Kewangan*", kind: "upload" },
    ],
    steps: {
      bm: "① Dua muka kotak RM — kotak yang tiada dalam senarai kami biarkan 0.00. ② Salin angka satu-satu; Jumlah dikira portal, banding sahaja. ③ Muat naik penyata yang TELAH diaudit (templat rasmi: pautan “Muat Turun Templat Penyata Kewangan” di halaman itu), kemudian Seterusnya.",
      zh: "① 两页 RM 数字格 —— 我们清单里没有的格子填 0.00。② 一格一格贴；总计 portal 自己算，拿来对一下就好。③ 上传「已审计」的财务报表（官方模板就在那页的 Muat Turun Templat Penyata Kewangan 链接），然后 Seterusnya。",
      en: "① Two pages of RM boxes — boxes not in our list stay 0.00. ② Paste figure by figure; totals are the portal's, just compare. ③ Upload the AUDITED statement (official template: that page's own “Muat Turun Templat Penyata Kewangan” link), then Seterusnya.",
    },
  },
  "6": {
    path: "…/penyata-tahunan-aktiviti",
    railStep: 6,
    paneTitle: "Laporan Aktiviti",
    boxes: [
      { label: "Terdapat rekod aktiviti", value: "Ya", kind: "tanda" },
      { label: "Lampiran aktiviti pertubuhan", kind: "upload" },
    ],
    steps: {
      bm: "① Jana Laporan Aktiviti dalam MinitAI (butang di bawah), semak, muat turun PDF. ② Tanda suis “Terdapat rekod aktiviti”. ③ Muat naik PDF itu, Seterusnya.",
      zh: "① 先在 MinitAI 生成活动报告（下面有按钮）、核对、下载 PDF。② 把「Terdapat rekod aktiviti」开关打开。③ 传上那份 PDF，按 Seterusnya。",
      en: "① Generate the activity report in MinitAI (button below), check it, download the PDF. ② Turn on “Terdapat rekod aktiviti”. ③ Upload that PDF, Seterusnya.",
    },
  },
  "7": {
    path: "…/penyata-tahunan-sumbangan",
    railStep: 7,
    paneTitle: "Sumbangan Dari/Ke Luar Negara",
    boxes: [
      { label: "Jadual: Sumbangan DARI luar negara", value: "Tiada Data", kind: "sendiri" },
      { label: "Jadual: Sumbangan KE luar negara", value: "Tiada Data", kind: "sendiri" },
    ],
    steps: {
      bm: "① Kebanyakan pertubuhan tempatan: kedua-dua jadual kekal “Tiada Data”. ② KALAU benar ada, isi dari rekod bank anda. ③ Seterusnya.",
      zh: "① 本地社团大多数：两张表保持「Tiada Data」。② 真有的话，照银行记录自己填。③ Seterusnya。",
      en: "① Most local societies: both tables stay “Tiada Data”. ② If you truly have some, fill them from your bank records. ③ Seterusnya.",
    },
  },
  "8": {
    path: "…/penyata-tahunan-paparan",
    railStep: 8,
    paneTitle: "Paparan Penyata Tahunan",
    boxes: [
      { label: "Keseluruhan penyata (paparan penuh)", value: "…", kind: "auto" },
      { label: "Butang Cetak", kind: "sendiri" },
    ],
    steps: {
      bm: "① Baca keseluruhan paparan. ② Tekan Cetak dan SIMPAN satu salinan (PDF pun boleh). ③ Seterusnya.",
      zh: "① 整份预览读一遍。② 按 Cetak 存一份底（存成 PDF 也行）。③ Seterusnya。",
      en: "① Read the whole preview. ② Press Cetak and KEEP a copy (PDF is fine). ③ Seterusnya.",
    },
  },
  "9": {
    path: "…/penyata-tahunan-pengakuan",
    railStep: 9,
    peringatan: "Seksyen 54A Akta Pertubuhan 1966 — maklumat palsu boleh didenda sehingga RM2,000.",
    paneTitle: "Pengakuan",
    boxes: [
      { label: "Akuan Seksyen 54A", kind: "tanda" },
      { label: "Butang Hantar", kind: "sendiri" },
    ],
    steps: {
      bm: "① Semak semula setiap nilai yang ditampal. ② Baca akuan, tanda. ③ Hantar — dan simpan nombor rujukan yang portal beri.",
      zh: "① 把贴过的每个值再对一遍。② 读宣誓文，勾选。③ 送出 —— portal 给的参考编号记得存起来。",
      en: "① Re-check every pasted value. ② Read the declaration, tick. ③ Submit — and keep the reference number the portal gives you.",
    },
  },
};

/** The little schematic itself. */
export function PortalSketch({ step }: { step: keyof typeof SKETCHES | string }) {
  const s = SKETCHES[String(step)];
  if (!s) return null;
  return (
    <figure
      className="overflow-hidden rounded-md border border-[color:var(--v2-border)] bg-[color:var(--v2-card)]"
      data-probe={`sketch-${step}`}
    >
      {/* fake browser bar */}
      <div className="flex items-center gap-2 border-b border-[color:var(--v2-border)] bg-black/5 px-3 py-1.5 text-xs text-muted-foreground dark:bg-white/5">
        <span aria-hidden>🌐</span>
        <span className="truncate font-mono">eroses.gov.my · {s.path}</span>
      </div>
      <div className="flex">
        {/* the portal's own checklist rail, current step highlighted */}
        {s.railStep > 0 && (
          <div className="hidden w-44 shrink-0 border-r border-[color:var(--v2-border)] p-2 @xl:block">
            <div className="mb-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
              Langkah penyata tahunan
            </div>
            <ol className="flex flex-col gap-0.5 text-[11px]">
              {RAIL.map((r, i) => (
                <li
                  key={r}
                  className={
                    i + 1 === s.railStep
                      ? "rounded-xs bg-teal-600/15 px-1 py-0.5 font-semibold text-teal-800 dark:text-teal-200"
                      : i + 1 < s.railStep
                        ? "px-1 py-0.5 text-teal-700/80 dark:text-teal-300/80"
                        : "px-1 py-0.5 text-muted-foreground"
                  }
                >
                  {i + 1 < s.railStep ? "☑" : "☐"} {r}
                </li>
              ))}
            </ol>
          </div>
        )}
        {/* the main pane */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
          {s.peringatan && (
            <div className="rounded-sm border border-red-300/70 bg-red-50/70 px-2 py-1 text-[11px] text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
              <span className="font-semibold">PERINGATAN:</span> {s.peringatan}
            </div>
          )}
          <div className="text-sm font-semibold text-teal-700 dark:text-teal-300">{s.paneTitle}</div>
          <div className="flex flex-col gap-1.5">
            {s.boxes.map((b) => {
              const chip = KIND_CHIP[b.kind];
              return (
                <div key={b.label} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="min-w-[11rem] flex-1 text-muted-foreground">{b.label}</span>
                  <span
                    className={
                      "min-w-[8rem] flex-1 rounded-xs border px-2 py-1 font-mono " +
                      (b.kind === "upload"
                        ? "border-dashed border-[color:var(--v2-outline-border)] text-muted-foreground"
                        : "border-[color:var(--v2-outline-border)]")
                    }
                  >
                    {b.kind === "upload" ? "Tiada Dokumen Tersedia" : (b.value ?? "—")}
                  </span>
                  <span className="whitespace-nowrap rounded-full bg-black/5 px-2 py-0.5 text-[11px] dark:bg-white/10">
                    {chip.icon} <Tri bm={chip.bm} zh={chip.zh} en={chip.en} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <figcaption className="border-t border-[color:var(--v2-border)] bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
        <Tri bm={s.steps.bm} zh={s.steps.zh} en={s.steps.en} />
        <span className="mt-1 block text-xs text-muted-foreground">
          <Tri
            bm="Lakaran sahaja — bukan tangkapan skrin; data di dalamnya rekaan."
            zh="示意图 —— 不是截图，里面的数据是虚构的。"
            en="A sketch, not a screenshot — the data in it is fictional."
          />
        </span>
      </figcaption>
    </figure>
  );
}
