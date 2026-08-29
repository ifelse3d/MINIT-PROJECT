"use client";

// ---------------------------------------------------------------------------
// 設置 → 成員 (B-3, 2026-08-25): the hq_admin's member & invite card.
//
//   - the member list: change a role, remove a member (with confirm; the
//     last administrator can never be demoted or removed — server-checked)
//   - generate an invite code (choose role + expiry), shown big with a copy
//     button; the admin sends it over WhatsApp themselves
//   - the invite list with status, and revoke for codes still open
//
// Rendered only for hq_admin (the page checks); the server actions check
// again, because the UI is never the authority (B-4).
// ---------------------------------------------------------------------------

import { startTransition, useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmedAction } from "@/components/confirm-delete";
import { Tri, useTriText } from "@/components/language-provider";
import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
import { ROLES } from "@/lib/roles";
import {
  changeMemberRole,
  createInvite,
  removeMember,
  revokeInvite,
  type InviteRow,
  type MemberAdminState,
  type MemberRow,
} from "./member-actions";
import { HelpNote, SettingsBlock } from "./ui";

const INITIAL: MemberAdminState = { error: null, ok: false };

/** Roles offered when inviting / changing. All six — inviting a co-admin is
 *  legitimate (two-person committees exist). */
const ROLE_CHOICES = ROLES;

export function MembersRows({
  members,
  invites,
}: {
  members: MemberRow[];
  invites: InviteRow[];
}) {
  const t = useTriText();
  // §1-13 (work order 69, tester's broken-layout screenshot): this used to be
  // ONE SettingsRow — the whole member list + invite form squeezed into the
  // control column beside a 46% label column, and opening "What is this?"
  // (in the label column) squeezed it further. A management UI is not a
  // label-beside-control setting: it gets the full width, with the explainer
  // folded on top (the page heading already names the section).
  return (
    <SettingsBlock>
      <HelpNote>
        <Tri
          bm="Jana satu kod untuk setiap orang, pilih peranannya, dan hantar kod itu kepadanya (WhatsApp pun boleh). Dia masukkan kod semasa mendaftar atau di halaman Sertai — terus masuk dengan peranan yang betul."
          zh="每个人生成一个邀请码，选好角色，把码发给他（WhatsApp 就行）。他注册时或在「加入」页输入，就会以正确的角色直接进来。"
          en="Generate one code per person, pick their role, and send them the code (WhatsApp works). They enter it at sign-up or on the Join page and come in with the right role."
        />
      </HelpNote>
      <MemberList members={members} />
      <CreateInviteForm />
      {invites.length > 0 && <InviteList invites={invites} t={t} />}
    </SettingsBlock>
  );
}

// --- members ---------------------------------------------------------------

function MemberList({ members }: { members: MemberRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {members.map((m) => (
        <MemberLine key={m.id} member={m} />
      ))}
    </ul>
  );
}

function MemberLine({ member }: { member: MemberRow }) {
  const t = useTriText();
  const [roleState, roleAction, rolePending] = useActionState(changeMemberRole, INITIAL);
  const [removeState, removeAction, removePending] = useActionState(removeMember, INITIAL);
  const [role, setRole] = useState(member.role);
  const error = roleState.error ?? removeState.error;

  return (
    <li className="flex flex-col gap-1 rounded-md border border-[color:var(--v2-border)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-base font-semibold">
          {member.name}
          {member.isSelf && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              (<Tri bm="anda" zh="您自己" en="you" />)
            </span>
          )}
        </span>
        <form action={roleAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={member.id} />
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-10 min-w-0 max-w-full rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-2 text-base"
            aria-label={t("Peranan", "角色", "Role")}
          >
            {ROLE_CHOICES.map((r) => (
              <option key={r} value={r}>
                {t(
                  labelFor(ROLE_LABEL, r).bm,
                  labelFor(ROLE_LABEL, r).zh,
                  labelFor(ROLE_LABEL, r).en,
                )}
              </option>
            ))}
          </select>
          {role !== member.role && (
            <Button type="submit" size="sm" disabled={rolePending}>
              {rolePending ? "…" : <Tri bm="Simpan" zh="保存" en="Save" />}
            </Button>
          )}
        </form>
        {/* §1-10: the app's own dialog, never window.confirm. */}
        <span className="ml-auto">
          <ConfirmedAction
            body={
              <Tri
                bm={`Buang "${member.name}" daripada pertubuhan ini? Dia tidak lagi dapat membuka rekod pertubuhan.`}
                zh={`要把「${member.name}」移出机构吗？之后他就打不开机构的记录了。`}
                en={`Remove "${member.name}" from this organisation? They will no longer be able to open its records.`}
              />
            }
            confirmLabel={<Tri bm="Buang" zh="移除" en="Remove" />}
            onConfirm={() => {
              const fd = new FormData();
              fd.set("id", String(member.id));
              startTransition(() => removeAction(fd));
            }}
            trigger={(open) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={removePending}
                onClick={open}
              >
                <Tri bm="Buang" zh="移除" en="Remove" />
              </Button>
            )}
          />
        </span>
      </div>
      {error && (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

// --- invites ---------------------------------------------------------------

function CreateInviteForm() {
  const t = useTriText();
  const [state, formAction, pending] = useActionState(createInvite, INITIAL);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-[color:var(--v2-primary)]/30 p-3">
      <p className="text-base font-semibold">
        <Tri bm="Jemput seorang ahli" zh="邀请一位成员" en="Invite a member" />
      </p>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-muted-foreground">
            <Tri bm="Peranan" zh="角色" en="Role" />
          </span>
          <select
            name="role"
            defaultValue="committee"
            className="h-11 min-w-0 max-w-full rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-2 text-base"
          >
            {ROLE_CHOICES.map((r) => (
              <option key={r} value={r}>
                {t(
                  labelFor(ROLE_LABEL, r).bm,
                  labelFor(ROLE_LABEL, r).zh,
                  labelFor(ROLE_LABEL, r).en,
                )}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-muted-foreground">
            <Tri bm="Sah sehingga" zh="有效期" en="Valid for" />
          </span>
          <select
            name="expiresDays"
            defaultValue="30"
            className="h-11 min-w-0 max-w-full rounded-sm border border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] px-2 text-base"
          >
            <option value="7">{t("7 hari", "7 天", "7 days")}</option>
            <option value="30">{t("30 hari", "30 天", "30 days")}</option>
            <option value="0">{t("Tiada tempoh", "不设期限", "No expiry")}</option>
          </select>
        </label>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <Tri bm="Sebentar…" zh="请稍候…" en="One moment…" />
          ) : (
            <Tri bm="Jana kod" zh="生成邀请码" en="Generate code" />
          )}
        </Button>
      </form>
      {state.ok && state.code && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-green-400 bg-green-50 p-3">
          <span className="font-mono text-2xl font-bold tracking-widest text-green-900">
            {state.code}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(state.code ?? "").then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? (
              <>
                <Check className="h-5 w-5" strokeWidth={2.2} />
                <Tri bm="Disalin" zh="已复制" en="Copied" />
              </>
            ) : (
              <>
                <Copy className="h-5 w-5" strokeWidth={2} />
                <Tri bm="Salin" zh="复制" en="Copy" />
              </>
            )}
          </Button>
          <span className="text-sm text-green-900">
            <Tri
              bm="Hantar kod ini kepada orang itu — satu kod untuk seorang."
              zh="把这个码发给那个人 —— 一码一人。"
              en="Send this code to that person — one code per person."
            />
          </span>
        </div>
      )}
      {state.error && (
        <p className="text-sm font-medium text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}

function inviteStatus(
  inv: InviteRow,
): { key: "open" | "used" | "revoked" | "expired" } {
  if (inv.revokedAt) return { key: "revoked" };
  if (inv.usedAt) return { key: "used" };
  if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) return { key: "expired" };
  return { key: "open" };
}

function InviteList({
  invites,
  t,
}: {
  invites: InviteRow[];
  t: (bm: string, zh: string, en: string, sep?: string) => string;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {invites.map((inv) => (
        <InviteLine key={inv.id} invite={inv} t={t} />
      ))}
    </ul>
  );
}

function InviteLine({
  invite,
  t,
}: {
  invite: InviteRow;
  t: (bm: string, zh: string, en: string, sep?: string) => string;
}) {
  const [state, formAction, pending] = useActionState(revokeInvite, INITIAL);
  const status = inviteStatus(invite).key;
  const statusLabel = {
    open: t("Belum digunakan", "还没用", "Not used yet"),
    used: t("Sudah digunakan", "已使用", "Used"),
    revoked: t("Dibatalkan", "已撤销", "Revoked"),
    expired: t("Luput", "已过期", "Expired"),
  }[status];

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-sm border border-[color:var(--v2-border)] px-3 py-2 text-base">
      <span className={`font-mono tracking-widest ${status !== "open" ? "text-muted-foreground line-through" : "font-semibold"}`}>
        {invite.code}
      </span>
      <span className="text-sm text-muted-foreground">
        {t(
          labelFor(ROLE_LABEL, invite.role).bm,
          labelFor(ROLE_LABEL, invite.role).zh,
          labelFor(ROLE_LABEL, invite.role).en,
        )}
      </span>
      <span
        className={`text-sm font-medium ${status === "open" ? "text-green-700" : "text-muted-foreground"}`}
      >
        {statusLabel}
      </span>
      {status === "open" && (
        <form action={formAction} className="ml-auto">
          <input type="hidden" name="id" value={invite.id} />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            <Tri bm="Batalkan" zh="撤销" en="Revoke" />
          </Button>
        </form>
      )}
      {state.error && (
        <p className="w-full text-sm font-medium text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </li>
  );
}
