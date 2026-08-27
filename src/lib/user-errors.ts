// ---------------------------------------------------------------------------
// USER-FACING ERROR MESSAGES — one place, all three languages, plain words.
//
// WHY THIS FILE EXISTS (2026-07-28 audit)
// Every red banner in the app rendered whatever string the server happened to
// send, unmodified. Our users are 55-80 and many have never used a computer, and
// what they were shown included:
//
//   "Gagal / failed (500)"                     ← a raw HTTP status code
//   "unsupported file type (image/heic)"       ← a raw MIME type
//   "fileIndex 3 out of range — pack has 2 file(s)"  ← developer English
//   "AI call failed."                          ← English only, no recovery
//   "Ralat pelayan / server error."            ← no Chinese, no next step
//
// Rules for anything added here:
//   1. All three languages. A Chinese-only temple treasurer must be able to read
//      it — this is the single most common gap in the old strings.
//   2. Say what to DO next, concretely. "Try a clearer photo" is not enough;
//      say how (more light, flat on the table, closer).
//   3. Never show a status code, a MIME type, a field path or a stack.
//   4. Never blame the person.
// ---------------------------------------------------------------------------

export type UserError = { bm: string; zh: string; en: string };

/** Joined for transport in a JSON `error` field, which the UI prints as-is. */
export function joinUserError(e: UserError): string {
  return `${e.bm}\n${e.zh}\n${e.en}`;
}

export const USER_ERRORS = {
  noPhoto: {
    bm: "Tiada gambar dipilih. Tekan butang kamera dan pilih atau ambil satu gambar.",
    zh: "还没有选到照片。请按相机按钮，选一张照片或拍一张。",
    en: "No photo was chosen. Tap the camera button and pick or take one photo.",
  },

  /**
   * The most likely real failure on a phone: iPhones and many Android cameras
   * save HEIC. The old message printed the MIME type and did not say how to fix
   * it, which is useless to someone who has never opened a settings screen.
   */
  unsupportedImage: {
    bm: "MinitAI tidak dapat membaca jenis fail gambar ini. Cara paling mudah: buka gambar itu dalam album telefon, tekan Kongsi → Salin/Simpan sebagai JPEG, kemudian pilih semula. Atau ambil gambar baharu terus dari MinitAI menggunakan butang kamera.",
    zh: "MinitAI 读不了这种格式的图片。最简单的办法：在手机相册里打开这张照片，按「分享」→ 存成／复制成 JPEG，再重新选一次。或者直接在 MinitAI 里用相机按钮重新拍一张。",
    en: "MinitAI cannot read this kind of image file. Easiest fix: open the photo in your phone's album, tap Share → Copy/Save as JPEG, then choose it again. Or just take a fresh photo from inside MinitAI using the camera button.",
  },

  unsupportedLedgerFile: {
    bm: "MinitAI hanya boleh membaca gambar (JPG, PNG) atau fail PDF di sini. Kalau anda ada gambar dari telefon, ambil semula terus dari MinitAI menggunakan butang kamera.",
    zh: "这里只能读图片（JPG、PNG）或 PDF 文件。如果是手机里的照片，最好直接在 MinitAI 里用相机按钮重新拍一张。",
    en: "MinitAI can only read images (JPG, PNG) or PDF files here. If it is a photo from your phone, take a fresh one from inside MinitAI with the camera button.",
  },

  unsupportedEventFile: {
    bm: "MinitAI hanya boleh membaca gambar, fail Excel (.xlsx), .csv atau teks di sini. Anda juga boleh taip atau tampal senarai acara ke dalam kotak di atas.",
    zh: "这里只能读图片、Excel 文件（.xlsx）、.csv 或文字。您也可以直接把活动清单打字或贴进上面的框里。",
    en: "MinitAI can only read images, Excel files (.xlsx), .csv or text here. You can also type or paste the list of events into the box above.",
  },

  /**
   * "Retake at a lower resolution" (the old wording) asks for a camera setting
   * most of these users cannot find. Cropping in the album is findable.
   */
  fileTooLarge: {
    bm: "Fail ini terlalu besar (lebih 8MB). Buka gambar dalam album telefon, potong (crop) bahagian yang ada tulisan sahaja, kemudian pilih semula. Kalau nota anda panjang, ambil dua gambar berasingan.",
    zh: "这个文件太大了（超过 8MB）。请在手机相册里打开照片，裁掉空白的部分、只留有字的地方，再重新选一次。如果笔记很长，可以分成两张照片。",
    en: "This file is too large (over 8MB). Open the photo in your phone's album, crop it to just the part with writing, then choose it again. If your notes are long, take two separate photos.",
  },

  nothingToRead: {
    bm: "Tiada apa-apa untuk dibaca. Taip atau tampal senarai acara ke dalam kotak, atau pilih satu fail.",
    zh: "没有内容可以读。请把活动清单打字或贴进框里，或者选一个文件。",
    en: "There is nothing to read. Type or paste the list of events into the box, or choose a file.",
  },

  /** The AI vendor call itself failed (network, key, outage). Not the user. */
  aiUnavailable: {
    bm: "Pembantu AI tidak dapat dihubungi sekarang. Ini bukan salah anda dan tiada apa-apa yang hilang. Tunggu seminit dan tekan butang itu sekali lagi.",
    zh: "现在连不上 AI 助手。这不是您的问题，也没有东西丢掉。请等一分钟，再按一次那个按钮。",
    en: "The AI assistant could not be reached just now. This is not your fault and nothing has been lost. Wait a minute and tap the button again.",
  },

  /**
   * P-1 (2026-08-27): the vendor took too long and Minit stopped waiting —
   * before Vercel could kill the function mid-flight. Says out loud that the
   * quota was returned, because "The connection dropped" with a silently eaten
   * action is exactly the incident this message exists to prevent. Only use it
   * on a path that really did refund.
   */
  aiTimeout: {
    bm: "AI mengambil masa terlalu lama, jadi MinitAI berhenti menunggu. Tindakan ini TIDAK ditolak daripada kuota anda — ia sudah dipulangkan. Tunggu seminit dan cuba sekali lagi.",
    zh: "AI 这次用的时间太长，MinitAI 停止了等待。这一次不算进您的用量——已经自动退回。请等一分钟再试一次。",
    en: "The AI took too long, so MinitAI stopped waiting. This attempt was NOT taken from your quota — it has been returned. Wait a minute and try again.",
  },

  /**
   * The model answered twice and both answers failed validation. Concrete photo
   * advice instead of "try a clearer photo".
   */
  aiCouldNotRead: {
    bm: "AI tidak dapat membaca tulisan dalam gambar ini. Cuba lagi dengan: cahaya lebih terang (dekat tingkap), kertas dibentang rata di atas meja, telefon tepat di atas kertas, dan satu halaman sahaja dalam satu gambar.",
    zh: "AI 读不出这张照片里的字。请这样再试一次：光线亮一点（靠窗最好）、纸摊平放在桌上、手机正对着纸的上方、一张照片只拍一页。",
    en: "The AI could not read the writing in this photo. Try again with: brighter light (near a window), the paper flat on a table, the phone directly above it, and only one page per photo.",
  },

  // --- Bringing in a committee list (2026-08-19) ------------------------
  // Three of their own, because the roster escape hatch can be reached with
  // TEXT and none of the photo wording above is true then: telling someone
  // holding a pasted list to "move nearer a window" is nonsense.

  rosterNothingToRead: {
    bm: "Tiada apa-apa untuk dibaca. Tampal senarai anda ke dalam kotak, atau pilih gambar/PDF senarai itu.",
    zh: "没有内容可以读。请把名单贴进框里，或者选一张名单的照片／PDF。",
    en: "There is nothing to read. Paste your list into the box, or choose a photo or PDF of it.",
  },

  rosterTextTooLong: {
    bm: "Senarai itu terlalu panjang untuk dibaca sekali gus. Bawa masuk sebahagian dahulu (contohnya 50 orang), kemudian tampal yang selebihnya.",
    zh: "这份名单太长了，一次读不完。可以先带一部分进来（例如 50 个人），再贴剩下的。",
    en: "That list is too long to read in one go. Bring in part of it first (say 50 people), then paste the rest.",
  },

  /** The text road's version of aiCouldNotRead. No camera advice. */
  rosterTextCouldNotRead: {
    bm: "MinitAI tidak dapat mengenal pasti sesiapa dalam teks itu. Pastikan setiap orang berada pada baris sendiri, dengan jawatan dan nama pada baris yang sama — contohnya “Setiausaha, Lim Siew Mei”. Anda juga boleh menaipnya sendiri dalam borang di atas.",
    zh: "MinitAI 在这段文字里认不出任何一位理事。请让每个人各占一行，职位和姓名写在同一行 —— 例如「秘书, 林小美」。您也可以直接用上面的表格自己打进去。",
    en: "MinitAI could not make out anyone in that text. Put each person on their own line with the position and the name together — for example “Setiausaha, Lim Siew Mei”. You can also type them in yourself using the form above.",
  },

  aiCouldNotUnderstandQuestion: {
    bm: "AI tidak faham soalan itu. Cuba satu soalan pendek tentang satu perkara sahaja — contohnya “Berapa hari notis untuk AGM?” atau “Berapa jumlah derma bulan lepas?”.",
    zh: "AI 没听懂这个问题。请一次只问一件事，句子短一点 —— 例如「开年度大会要提前几天通知？」或者「上个月一共收了多少捐款？」。",
    en: "The AI did not understand that question. Try one short question about one thing — for example “How many days notice for the AGM?” or “How much was donated last month?”.",
  },

  /** Anything unexpected on the server. Never leak the cause. */
  serverError: {
    bm: "Ada masalah di pihak MinitAI, bukan pada anda. Tiada apa-apa yang hilang. Tunggu seminit dan cuba sekali lagi.",
    zh: "是 MinitAI 这边出了问题，不是您的操作有错，也没有东西丢掉。请等一分钟再试一次。",
    en: "Something went wrong on MinitAI's side, not yours. Nothing has been lost. Wait a minute and try again.",
  },

  downloadFailed: {
    bm: "Fail itu tidak dapat disiapkan. Tiada apa-apa yang berubah dalam rekod anda. Tunggu seminit dan tekan butang muat turun sekali lagi.",
    zh: "这个文件没能做出来。您的记录没有任何改变。请等一分钟，再按一次下载。",
    en: "That file could not be prepared. Nothing in your records has changed. Wait a minute and tap download again.",
  },

  needOrg: {
    bm: "Pilih pertubuhan anda dahulu di halaman Pertubuhan.",
    zh: "请先在「机构」页面选择您的机构。",
    en: "Choose your organisation first, on the Organisations page.",
  },

  signInAgain: {
    bm: "Sesi anda sudah tamat. Sila log masuk semula, kemudian cuba sekali lagi.",
    zh: "登入已经过期。请重新登入，然后再试一次。",
    en: "Your session has expired. Please sign in again, then try once more.",
  },

  /**
   * The database has not been given migration 20260820000000 yet, so it still
   * only allows agm / egm / committee. Named, not hidden behind serverError:
   * this one is fixed by the person who runs the system in about a minute, and
   * "wait a minute and try again" would have them waiting forever.
   */
  databaseBehind: {
    bm: "Jenis mesyuarat ini belum dibenarkan oleh pangkalan data. MinitAI sudah bersedia, cuma kemas kini pangkalan data (20260820000000) belum dijalankan. Beritahu orang yang menguruskan sistem — kerja anda tidak hilang; simpan sebagai Mesyuarat Jawatankuasa buat sementara jika perlu.",
    zh: "资料库还不接受这个会议类型。MinitAI 这边已经准备好了，只差那支资料库更新（20260820000000）还没有跑。请告诉负责系统的人 —— 您的东西没有丢；真的急的话可以先选「理事会议」保存。",
    en: "The database does not allow this meeting type yet. MinitAI is ready; the database update (20260820000000) has not been run. Tell whoever looks after the system — nothing you typed has been lost, and you can save it as a Committee Meeting for now if you need to.",
  },
} satisfies Record<string, UserError>;

// ---------------------------------------------------------------------------
// WHEN IT IS THE PERSON'S INPUT, NOT THE SERVER (2026-08-20)
//
// `serverError` above says "Something went wrong on Minit's side, not yours.
// Wait a minute and try again." For a real outage that is right and kind. For a
// value that failed validation it is neither TRUE nor USEFUL — J typed
// "2/2/2026" into the date box, was told Minit had a problem, and waited.
//
// Rule (the same one as "an escape hatch belongs where the failure happens"):
// REFUSING AN INPUT MEANS SAYING WHICH BOX, WHY, AND WHAT TO DO — at the moment
// of refusing. This is not "leaking the cause": the cause is the person's own
// value, they are allowed to know it, and they are the only one who can fix it.
// ---------------------------------------------------------------------------

const FIELD_LABEL: Record<string, UserError> = {
  meeting_type: { bm: "Jenis mesyuarat", zh: "会议类型", en: "Meeting type" },
  meeting_type_label: { bm: "Nama mesyuarat", zh: "会议名称", en: "Meeting name" },
  meeting_date: { bm: "Tarikh mesyuarat", zh: "会议日期", en: "Meeting date" },
  meeting_venue: { bm: "Tempat mesyuarat", zh: "会议地点", en: "Meeting venue" },
  attendees: { bm: "Kehadiran", zh: "出席名单", en: "Who attended" },
  resolutions: { bm: "Keputusan mesyuarat", zh: "会议决议", en: "What was decided" },
  figures: { bm: "Angka kewangan", zh: "款项数字", en: "Money figures" },
  office_bearers: { bm: "Pemegang jawatan", zh: "职位与人名", en: "Office bearers" },
};

const FIELD_HINT: Record<string, UserError> = {
  meeting_type: {
    bm: "Pilih satu daripada senarai di langkah 2. Kalau tiada yang sesuai, pilih “Lain-lain” dan tulis nama mesyuarat anda sendiri.",
    zh: "请在第 2 步从清单里选一个。没有合适的，就选「其他」，然后自己写会议的名称。",
    en: "Pick one from the list in step 2. If none of them fit, choose “Other” and write your own name for the meeting.",
  },
  meeting_date: {
    bm: "Tulis hari/bulan/tahun — contohnya 2/2/2026 untuk 2 Februari 2026 — atau pilih tarikh dari kalendar di langkah 2.",
    zh: "请写「日/月/年」—— 例如 2/2/2026 就是 2026 年 2 月 2 日 —— 或者在第 2 步直接从日历里点选。",
    en: "Write day/month/year — 2/2/2026 means 2 February 2026 — or pick the date from the calendar in step 2.",
  },
};

/**
 * A message that names the box. `fieldKey` is the top-level field of the
 * extraction that failed; anything unrecognised falls back to a general
 * "check step 2" message rather than inventing a field name.
 */
export function inputProblemError(fieldKey: string): UserError {
  const label = FIELD_LABEL[fieldKey];
  const hint = FIELD_HINT[fieldKey];
  if (!label) {
    return {
      bm: "Ada satu maklumat di langkah 2 yang MinitAI tidak dapat terima. Buka langkah 2, semak setiap medan sekali lagi, dan betulkan yang bertanda merah atau kuning.",
      zh: "第 2 步里有一项 MinitAI 收不下。请打开第 2 步，把每一格再看一次，红色和黄色的那几格改一改。",
      en: "One of the entries in step 2 could not be accepted. Open step 2, look through the fields again, and correct the ones marked red or amber.",
    };
  }
  const tail = (k: keyof UserError) => (hint ? ` ${hint[k]}` : "");
  return {
    bm: `MinitAI tidak dapat menerima apa yang ditulis dalam “${label.bm}”.${tail("bm")}`,
    zh: `「${label.zh}」这一格填的内容，MinitAI 收不下。${tail("zh")}`,
    en: `MinitAI could not accept what is in “${label.en}”.${tail("en")}`,
  };
}

/**
 * 2026-08-21. Says the number of pages it actually counted and the number
 * allowed, because "too many pages" without either is unactionable. It offers
 * the FREE way out first (photograph the part you need, or split the file)
 * before mentioning a plan — docs/方案与权益设计.md line 167.
 *
 * Written as a function, not a constant, because a message that cannot name
 * the two numbers is the message we are replacing.
 */
export function tooManyPagesError(pages: number, limit: number): UserError {
  return {
    bm: `Fail ini ada ${pages} muka surat. MinitAI membaca sehingga ${limit} muka surat sekali baca, supaya satu bacaan tidak menghabiskan kuota AI anda. Cara paling mudah: ambil gambar muka surat yang anda perlukan sahaja, atau pecahkan fail ini kepada beberapa bahagian dan hantar satu demi satu.`,
    zh: `这个文件有 ${pages} 页。MinitAI 一次最多读 ${limit} 页，这样一次读取才不会用掉您大部分的 AI 用量。最简单的办法：只拍您需要的那几页，或者把文件分成几份，一份一份地传。`,
    en: `This file has ${pages} pages. MinitAI reads up to ${limit} pages at a time, so that one read cannot use up your AI quota. Easiest fix: photograph only the pages you need, or split the file into parts and send them one at a time.`,
  };
}
