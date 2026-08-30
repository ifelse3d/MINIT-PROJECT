import type { ConfirmedClause } from "./constitution";

// ---------------------------------------------------------------------------
// SAMPLE DATA — a FICTIONAL society constitution, already human-confirmed.
// Same org as sample-roster.ts so the demo tells one coherent story.
// Written the way real ROS model constitutions read (BM, formal), with a
// 14-day AGM notice clause so Phase 5 can REPLACE the Phase 4 amber
// "notice period came from a setting" warning with a cited clause.
// ---------------------------------------------------------------------------

export const sampleConstitutionOrgName =
  "Persatuan Penganut Dewa Guan Di Selangor — Cawangan Klang";

export const sampleConstitutionTitle =
  "Undang-Undang Tubuh Persatuan Penganut Dewa Guan Di Selangor";

export const sampleClauses: ConfirmedClause[] = [
  {
    clause_no: "Fasal 1",
    heading: "Nama",
    // Word for word the contoh generator's Fasal 1 (both paragraphs) —
    // scripts/make-contoh-constitution.mjs. This is the sentence shape
    // ("dikenali sebagai …") that findRegisteredName must keep reading, and
    // the 1.2 sentence is what findRegisteredAddress reads (work order 85 ①⑥).
    text: "Pertubuhan ini dikenali sebagai Persatuan Penganut Dewa Guan Di Selangor - Cawangan Klang, dan selepas ini disebut sebagai Persatuan. 1.2 Tempat urusan berdaftar Persatuan ialah No. 12, Jalan Tepi Sungai, 41100 Klang, Selangor Darul Ehsan, atau di mana-mana tempat lain yang ditetapkan oleh Jawatankuasa dari semasa ke semasa dan diberitahu kepada Pendaftar Pertubuhan.",
    page_ref: "muka surat 1",
  },
  {
    clause_no: "Fasal 3",
    heading: "Keahlian",
    text: "Keahlian terbuka kepada semua warganegara Malaysia yang berumur 18 tahun ke atas yang menganut kepercayaan persatuan ini. Permohonan menjadi ahli hendaklah dibuat secara bertulis kepada Setiausaha dan diluluskan oleh Jawatankuasa.",
    page_ref: "muka surat 2",
  },
  {
    clause_no: "Fasal 4",
    heading: "Yuran",
    text: "Yuran tahunan sebanyak RM24 hendaklah dijelaskan kepada Bendahari sebelum 31 Mac setiap tahun. Ahli yang gagal menjelaskan yuran selama dua tahun berturut-turut akan gugur keahliannya setelah diberi notis bertulis.",
    page_ref: "muka surat 2",
  },
  {
    clause_no: "Fasal 8",
    heading: "Mesyuarat Agung Tahunan",
    text: "Mesyuarat Agung Tahunan hendaklah diadakan tidak lewat daripada 30 Jun setiap tahun. Notis mesyuarat berserta agenda hendaklah dihantar kepada semua ahli sekurang-kurangnya 14 hari sebelum tarikh mesyuarat.",
    page_ref: "muka surat 4",
  },
  {
    clause_no: "Fasal 8.2",
    heading: "Kuorum",
    text: "Kuorum Mesyuarat Agung ialah satu perdua (1/2) daripada jumlah ahli yang berhak mengundi atau dua kali jumlah ahli Jawatankuasa, mengikut mana yang kurang. Sekiranya kuorum tidak cukup selepas setengah jam, mesyuarat hendaklah ditangguhkan ke tarikh lain tidak melebihi 30 hari.",
    page_ref: "muka surat 4",
  },
  {
    clause_no: "Fasal 9",
    heading: "Mesyuarat Agung Khas",
    text: "Mesyuarat Agung Khas boleh diadakan atas permintaan bertulis tidak kurang daripada satu perlima (1/5) daripada jumlah ahli yang berhak mengundi, dengan menyatakan tujuan mesyuarat itu.",
    page_ref: "muka surat 5",
  },
  {
    clause_no: "Fasal 10",
    heading: "Jawatankuasa",
    text: "Jawatankuasa hendaklah terdiri daripada seorang Pengerusi, seorang Timbalan Pengerusi, seorang Setiausaha, seorang Bendahari dan tujuh orang Ahli Jawatankuasa Biasa, yang dipilih dalam Mesyuarat Agung Tahunan setiap dua tahun sekali.",
    page_ref: "muka surat 5",
  },
  {
    clause_no: "Fasal 12",
    heading: "Kewangan",
    text: "Segala wang persatuan hendaklah dimasukkan ke dalam akaun bank atas nama persatuan. Cek hendaklah ditandatangani oleh Bendahari bersama Pengerusi atau Setiausaha. Perbelanjaan melebihi RM5,000 memerlukan kelulusan Jawatankuasa terlebih dahulu.",
    page_ref: "muka surat 6",
  },
  {
    clause_no: "Fasal 12.3",
    heading: "Akaun dan Audit",
    text: "Akaun persatuan hendaklah diaudit oleh dua orang pemeriksa kira-kira yang dilantik dalam Mesyuarat Agung Tahunan, dan penyata kewangan yang telah diaudit hendaklah dibentangkan dalam Mesyuarat Agung Tahunan berikutnya.",
    page_ref: "muka surat 6",
  },
  {
    clause_no: "Fasal 14",
    heading: "Pindaan Undang-Undang",
    text: "Undang-undang ini tidak boleh dipinda kecuali dengan ketetapan Mesyuarat Agung dan dengan persetujuan dua pertiga (2/3) daripada ahli yang hadir. Pindaan hendaklah dikemukakan kepada Pendaftar Pertubuhan dalam tempoh 60 hari.",
    page_ref: "muka surat 7",
  },
  {
    clause_no: "Fasal 16",
    heading: "Pembubaran",
    text: "Persatuan ini tidak boleh dibubarkan kecuali dengan persetujuan tidak kurang daripada tiga perlima (3/5) daripada jumlah ahli yang berhak mengundi dalam suatu Mesyuarat Agung yang dipanggil khas untuk tujuan itu. Baki wang selepas pembubaran hendaklah diserahkan kepada badan kebajikan yang diluluskan.",
    page_ref: "muka surat 8",
  },
];

/** Questions the demo suggests — one per common committee worry, trilingual. */
export const sampleQuestions: { bm: string; zh: string; en: string }[] = [
  {
    bm: "Berapa hari notis untuk AGM?",
    zh: "大会通知要提前几天？",
    en: "How many days' notice for the AGM?",
  },
  {
    bm: "Siapa boleh tandatangan cek?",
    zh: "谁可以签支票？",
    en: "Who can sign cheques?",
  },
  {
    bm: "Berapa kuorum mesyuarat agung?",
    zh: "大会的法定人数是多少？",
    en: "What is the AGM quorum?",
  },
  {
    bm: "Macam mana nak pinda perlembagaan?",
    zh: "怎样修改章程？",
    en: "How do we amend the constitution?",
  },
];
