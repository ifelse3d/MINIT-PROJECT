"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { Tri } from "@/components/language-provider";
import { signOutToLogin } from "@/components/v3/sign-out";

// ---------------------------------------------------------------------------
// B-1 + spec §8: signing out asks first — it never fires on the first click.
// It clears this device's local Minit data (S0-4, the shared-laptop rule),
// so the body says exactly that before it happens. Built on the one
// ConfirmDialog pattern; initial focus is on Cancel (the safe option).
// ---------------------------------------------------------------------------

export function SignOutConfirm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      busy={busy}
      onConfirm={() => {
        setBusy(true);
        void signOutToLogin();
      }}
      body={
        // #6 (J review 27-evening, 2026-08-28): short. The clearing of local
        // drafts is the reason the dialog exists, said in one line.
        <>
          <Tri bm="Log keluar?" zh="要退出吗？" en="Sign out?" />{" "}
          <span className="text-muted-foreground">
            <Tri
              bm="Deraf pada peranti ini akan dikosongkan. Rekod yang sudah disimpan selamat."
              zh="这台设备上的草稿会被清掉。已保存的记录不受影响。"
              en="Drafts on this device will be cleared. Saved records are safe."
            />
          </span>
        </>
      }
      confirmLabel={<Tri bm="Ya" zh="是" en="Yes" />}
    />
  );
}
