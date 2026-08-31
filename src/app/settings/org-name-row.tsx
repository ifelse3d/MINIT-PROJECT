"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tri } from "@/components/language-provider";
import { renameOrg } from "../orgs/actions";

// ---------------------------------------------------------------------------
// §3 (work order 104): CORRECT THE ORGANISATION'S NAME, HERE.
//
// J, 2026-08-31 evening: 「然後也沒得改好名字」— and he was right twice over.
// The constitution panel offered "use the name from the constitution" or "keep
// the current name" and nothing else, and BOTH it and the not-found message
// then told the reader to "correct it in Settings → Organisation" — where the
// name was printed as plain text with no control anywhere on the page. The
// instruction had been pointing at a door that did not exist.
//
// This is that door. Same server action the constitution panel's buttons use
// (renameOrg): user-scoped, so RLS decides whether this account may rename
// this society, and it revalidates the layout so the new name appears
// everywhere — sidebar, receipts, minutes — at once.
//
// Shown only to somebody with `manage_org`; the database refuses anyone else
// regardless, and a control that cannot work is worse than no control.
// ---------------------------------------------------------------------------

export function OrgNameEdit({
  orgId,
  currentName,
}: {
  orgId: number;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentName);
  const [state, action, pending] = useActionState(renameOrg, {
    error: null,
    ok: false,
  });

  if (state.ok && !open) {
    return (
      <p className="text-base text-green-800 dark:text-green-300">
        ✓{" "}
        <Tri
          bm="Nama pertubuhan sudah dikemas kini."
          zh="机构名称已经更新。"
          en="The organisation name has been updated."
        />
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(currentName);
          setOpen(true);
        }}
        className="w-fit text-base underline underline-offset-4"
      >
        ✏️{" "}
        <Tri
          bm="Betulkan nama pertubuhan"
          zh="改机构的名字"
          en="Correct the organisation's name"
        />
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          <Tri
            bm="Nama berdaftar (seperti dalam perlembagaan / sijil pendaftaran)"
            zh="注册名称（照章程或注册证书上的写法）"
            en="Registered name (as in the constitution / registration certificate)"
          />
        </span>
        <input
          name="name"
          value={value}
          onChange={(e) => {
            // C-4 (拍板 33), the same rule as the sign-up box and the
            // constitution panel: ROS writes society names in CAPITALS.
            const el = e.currentTarget;
            const pos = el.selectionStart;
            setValue(el.value.toUpperCase());
            if (pos !== null)
              requestAnimationFrame(() => el.setSelectionRange(pos, pos));
          }}
          maxLength={200}
          autoCapitalize="characters"
          className="w-full rounded-md border-2 border-input bg-white px-3 py-2 text-base dark:bg-white/5"
        />
      </label>
      {state.error && (
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || value.trim() === ""}>
          {pending ? (
            <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
          ) : (
            <Tri bm="Simpan nama ini" zh="用这个名字" en="Save this name" />
          )}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          <Tri bm="Batal" zh="取消" en="Cancel" />
        </Button>
      </div>
    </form>
  );
}
