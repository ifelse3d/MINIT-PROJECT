// ---------------------------------------------------------------------------
// §1 (work order 105) — THE CUT ITSELF, on a real multi-page PDF.
//
//   npx tsx scripts/probe-slice-105.ts
//
// The queue's whole trick is that /api/job/step reads FOUR PAGES at a time,
// and it cuts those four pages out of the original ON THE SERVER — because the
// browser that started the read may be closed by the time the next batch runs.
// If that cut is wrong, every batch reads the wrong pages and the bill is
// real, so it is worth proving on an actual document rather than on a mock.
//
// Builds its own PDF (pdf-lib, already a dependency), so it touches no
// database, no vendor and none of J's papers. Costs nothing.
// ---------------------------------------------------------------------------

import "./allow-server-only";

import { PDFDocument } from "pdf-lib";
import { planJobBatches, jobActionsDelta, jobReadActions } from "../src/lib/jobs-core";
import { slicePdfPages, batchFileName } from "../src/lib/pdf-slice";

const failures: string[] = [];
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

async function makePdf(pages: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  const saved = await doc.save();
  return saved.slice().buffer as ArrayBuffer;
}

async function pageCount(bytes: ArrayBuffer | Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  return doc.getPageCount();
}

async function run() {
  const TOTAL = 12;
  const bytes = await makePdf(TOTAL);
  check("a 12-page document is built", (await pageCount(bytes)) === TOTAL);

  const batches = planJobBatches(TOTAL);
  check("it is cut into three batches of four", batches.length === 3, JSON.stringify(batches));

  let seen = 0;
  let charged = 0;
  let done = 0;
  for (const b of batches) {
    const piece = await slicePdfPages(bytes, b.from, b.to);
    check(
      `batch ${b.from}-${b.to} really carries ${b.to - b.from + 1} pages`,
      piece !== null && (await pageCount(piece)) === b.to - b.from + 1,
    );
    seen += b.to - b.from + 1;
    charged += jobActionsDelta(done, b.to);
    done = b.to;
  }
  check("every page of the document is covered exactly once", seen === TOTAL, `seen=${seen}`);
  check(
    "the batches together cost exactly what the whole document costs",
    charged === jobReadActions(TOTAL),
    `charged=${charged} whole=${jobReadActions(TOTAL)}`,
  );

  // A document that is ALREADY one batch is sent whole — no copying, no
  // re-encoding, and (importantly) no chance of a re-save corrupting it.
  const short = await makePdf(3);
  check("a document that IS the batch is sent whole", (await slicePdfPages(short, 1, 3)) === null);

  // An impossible range, and rubbish bytes, both answer null so the caller
  // sends the file whole — exactly what every read did before the queue.
  check("a range past the end answers null", (await slicePdfPages(short, 9, 12)) === null);
  check(
    "bytes that are not a PDF answer null",
    (await slicePdfPages(new TextEncoder().encode("not a pdf").buffer as ArrayBuffer, 1, 2)) === null,
  );

  check(
    "the batch's name says which pages it is",
    batchFileName("minit mesyuarat.pdf", 5, 8) === "minit mesyuarat (ms 5-8).pdf",
  );

  console.log(failures.length === 0 ? "\nPASS" : `\nFAIL: ${failures.join(", ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
