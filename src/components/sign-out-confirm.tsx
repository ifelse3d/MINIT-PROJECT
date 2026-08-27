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
        <>
          <Tri bm="Log keluar?" zh="要退出吗？" en="Sign out?" />{" "}
          <span className="text-muted-foreground">
            <Tri
              bm="Data Minit pada peranti ini (deraf yang belum ada resit, kerja separuh siap) akan dikosongkan supaya pengguna komputer ini yang seterusnya tidak nampak rekod anda. Rekod yang sudah disimpan ke pertubuhan selamat."
              zh="这台设备上的本机资料（还没开收据的草稿、做到一半的东西）会被清掉，这样别人用这台电脑时看不到您的记录。已保存到机构的记录不受影响。"
              en="Minit's data on this device (unreceipted drafts, half-done work) will be cleared so the next person on this computer cannot see your records. Anything already saved to the organisation is safe."
            />
          </span>
        </>
      }
      confirmLabel={<Tri bm="Ya, log keluar" zh="是，退出" en="Yes, sign out" />}
    />
  );
}
