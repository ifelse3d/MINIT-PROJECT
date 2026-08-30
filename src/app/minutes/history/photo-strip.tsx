"use client";

import { useState } from "react";
import { PhotoLightbox, pageFileKind } from "@/components/page-thumbs";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The originals behind a SAVED document — signed-URL tiles. Photos open the
// shared PhotoLightbox (zoom, prev/next); 97 §6: a PDF original gets a "PDF"
// tile that opens the real file in a new tab, an Office original a "DOC"
// tile that opens/downloads it — before this, every path was fed to an
// <img>, so a PDF or .docx behind a saved document rendered as a broken
// picture. The storage paths were always saved; only the door was missing.
// ---------------------------------------------------------------------------

export function HistoryPhotoStrip({
  photos,
}: {
  photos: { path: string; url: string }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;

  // The lightbox pages only the real images, keeping their own indexing.
  // An extensionless path is treated as an image — that is what it always
  // rendered as, and a camera photo whose name got sanitised away must not
  // lose its thumbnail. Only paths that SAY pdf/office get the file tile.
  const kindOf = (path: string) => {
    const k = pageFileKind(path);
    return k === "other" ? "image" : k;
  };
  const images = photos.filter((p) => kindOf(p.path) === "image");

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-muted-foreground">
        <Tri
          bm="Dokumen asal mesyuarat ini — tekan untuk buka"
          zh="这场会议的原稿 —— 点开可看"
          en="This meeting's originals — tap to open"
        />
      </p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => {
          const kind = kindOf(p.path);
          if (kind === "image") {
            const imageIndex = images.findIndex((x) => x.path === p.path);
            return (
              <button
                key={p.path}
                type="button"
                onClick={() => setOpen(imageIndex)}
                className="block overflow-hidden rounded-sm border hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={`Gambar asal ${imageIndex + 1}`}
                  className="h-20 w-20 object-cover"
                />
              </button>
            );
          }
          // A PDF or Office original: a labelled tile that opens the REAL
          // file (short-lived signed URL) in a new tab. "other" gets the
          // same door — opening it is strictly better than a broken image.
          return (
            <a
              key={p.path}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-sm border bg-muted text-2xl hover:bg-accent"
              title={p.path.split("/").pop() ?? p.path}
            >
              📄
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
                {kind === "pdf" ? "PDF" : "DOC"}
              </span>
            </a>
          );
        })}
      </div>
      {open !== null && images[open] && (
        <PhotoLightbox
          pages={images.map((p, i) => ({
            name: `Gambar asal ${i + 1}`,
            src: p.url,
          }))}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
