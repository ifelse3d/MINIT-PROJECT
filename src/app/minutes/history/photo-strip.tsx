"use client";

import { useState } from "react";
import { PhotoLightbox } from "@/components/page-thumbs";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// The handwriting behind a SAVED document — signed-URL thumbnails that open
// the shared PhotoLightbox (zoom in/out, prev/next) instead of dumping the
// person into a bare browser tab (J 28/8 evening, item 5: the popup viewer,
// everywhere a photo can be looked back at).
// ---------------------------------------------------------------------------

export function HistoryPhotoStrip({
  photos,
}: {
  photos: { path: string; url: string }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-muted-foreground">
        <Tri
          bm="Gambar asal mesyuarat ini — tekan untuk besarkan"
          zh="这场会议的原始照片 —— 点开可以放大缩小"
          en="This meeting's original photos — tap to open and zoom"
        />
      </p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <button
            key={p.path}
            type="button"
            onClick={() => setOpen(i)}
            className="block overflow-hidden rounded-sm border hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={`Gambar asal ${i + 1}`}
              className="h-20 w-20 object-cover"
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <PhotoLightbox
          pages={photos.map((p, i) => ({
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
