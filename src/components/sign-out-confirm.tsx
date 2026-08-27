"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { Tri } from "@/components/language-provider";
import { signOutToLogin } from "@/components/v3/sign-out";

// ---------------------------------------------------------------------------
// B-1 (work order 32 §2B, avocado): signing out used to be ONE tap — and it
// clears this device's local Minit data (S0-4, the shared-laptop rule), so a
// mis-tap threw away unreceipted drafts with no warning. One confirm dialog,
// shared by every sign-out button, that says exactly that before it happens.
// ---------------------------------------------------------------------------

export function SignOutConfirm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="signout-title">
      <div className="flex flex-col gap-3">
        <h2 id="signout-title" className="text-xl font-semibold">
          <Tri bm="Log keluar?" zh="要退出吗？" en="Sign out?" />
        </h2>
        <p className="text-base text-muted-foreground">
          <Tri
            bm="Log keluar akan mengosongkan data Minit pada peranti ini (deraf yang belum ada resit dan kerja separuh siap) — supaya orang lain yang guna komputer ini tidak nampak rekod anda. Rekod yang sudah disimpan ke pertubuhan selamat."
            zh="退出会清掉这台设备上的本机资料（还没开收据的草稿、做到一半的东西）—— 这样别人用这台电脑时看不到您的记录。已经保存到机构的记录不受影响。"
            en="Signing out clears Minit's data on this device (unreceipted drafts, half-done work) — so the next person on this computer cannot see your records. Anything already saved to the organisation is safe."
          />
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="lg" variant="outline" className="text-base" onClick={onClose}>
            <Tri bm="Kekal log masuk" zh="先不退出" en="Stay signed in" />
          </Button>
          <Button size="lg" className="text-base" onClick={() => void signOutToLogin()}>
            <Tri bm="Ya, log keluar" zh="是，退出" en="Yes, sign out" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
