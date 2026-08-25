import { Tri } from "@/components/language-provider";
import { JoinForm } from "./join-form";

// /orgs/join — enter an invite code, join the organisation with the role the
// code carries (B-2, 2026-08-25). The second of the two doors at sign-up:
// "start a new society" (/orgs/new) or "I have an invite code" (here).
export const dynamic = "force-dynamic";

export default function JoinPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-10 pt-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri
              bm="Sertai pertubuhan anda"
              zh="加入您的机构"
              en="Join your organisation"
            />
          </span>
        </h1>
        <p className="mt-1 text-lg text-[color:var(--v2-text-soft)]">
          <Tri
            bm="Pentadbir pertubuhan memberi anda satu kod jemputan. Masukkannya di sini — anda terus menjadi ahli dengan peranan yang betul."
            zh="机构管理员会给您一个邀请码。在这里输入，就会以正确的角色直接加入。"
            en="Your organisation's administrator gives you an invite code. Enter it here and you join with the right role straight away."
          />
        </p>
      </div>
      <JoinForm />
    </div>
  );
}
