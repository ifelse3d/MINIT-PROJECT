import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tri } from "@/components/language-provider";
import { getSupabase } from "@/db/supabase";
import { getSessionUser } from "@/db/supabase-server";
import { isOperatorEmail } from "@/lib/admin-gate";
import { requiredAiKeyEnvVars } from "@/lib/ai/provider";

// Re-check on every page load — never serve a cached health status.
export const dynamic = "force-dynamic";

/** One label in the three interface languages; rendered through <Tri> so this
 *  page obeys the language switcher like every other screen. */
type Label = { bm: string; zh: string; en: string };

type CheckResult = {
  key: string;
  label: Label;
  ok: boolean;
  detail: Label;
};

/** A message with no translation (e.g. a raw dev-only error) — shown as-is. */
function sameInAll(text: string): Label {
  return { bm: text, zh: text, en: text };
}

// P-2 (work order 31): the AI keys to require come from where the FOUR
// AI_MODEL_* tasks are actually routed (the same resolveModel() the app and
// `npm run check:ai` use) — not from the legacy AI_PROVIDER value alone. The
// old version demanded only GEMINI_API_KEY while chat was routed to OpenAI, so
// /health said OK on a deployment whose assistant could not answer at all.
function requiredEnvVars(): string[] {
  return [
    ...requiredAiKeyEnvVars(),
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    // Phase 7 auth (public values — needed for login to work):
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
}

// Raw database error strings can reveal infrastructure details, so outside
// local development we map them to fixed messages instead.
function describeDbError(message: string): Label {
  if (/does not exist|could not find the table|schema cache/i.test(message)) {
    return {
      bm: "Jadual tiada — jalankan fail migrasi",
      zh: "缺少数据表 —— 请运行迁移文件",
      en: "Table missing — run the migration file",
    };
  }
  if (process.env.NODE_ENV === "development") {
    return sameInAll(message);
  }
  return {
    bm: "Sambungan gagal — semak log pelayan",
    zh: "连接失败 —— 请查看服务器日志",
    en: "Connection failed — check the server logs",
  };
}

async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // Env vars: report presence only — values are never displayed or logged.
  for (const name of requiredEnvVars()) {
    const present = Boolean(process.env[name]);
    checks.push({
      key: `env:${name}`,
      label: sameInAll(name),
      ok: present,
      detail: present
        ? {
            bm: "Ditetapkan (nilai disembunyikan)",
            zh: "已设置（值已隐藏）",
            en: "Set (value hidden)",
          }
        : {
            bm: "Tiada — isikan dalam .env.local",
            zh: "缺少 —— 请在 .env.local 中填写",
            en: "Missing — fill it in .env.local",
          },
    });
  }

  // Database: a real round-trip to Postgres (head-only count on orgs).
  const dbLabel: Label = {
    bm: "Pangkalan data: jadual orgs",
    zh: "数据库：orgs 表",
    en: "Database: orgs table",
  };
  const dbKey = "db:orgs";

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    checks.push({
      key: dbKey,
      label: dbLabel,
      ok: false,
      detail: {
        bm: "Tidak dapat diuji — pembolehubah Supabase belum ditetapkan",
        zh: "无法测试 —— Supabase 环境变量尚未设置",
        en: "Cannot test — Supabase env vars are not set yet",
      },
    });
  } else {
    try {
      const supabase = getSupabase();
      // `head: true` with no count: we only need to know whether the connection
      // works. The exact tenant count used to be rendered on a PUBLIC page —
      // that is business information, and it is not needed to answer "is the
      // database reachable?". (2026-07-28 audit.)
      const { error } = await supabase
        .from("orgs")
        .select("id", { head: true })
        .limit(1);

      if (error) {
        checks.push({
          key: dbKey,
          label: dbLabel,
          ok: false,
          detail: describeDbError(error.message),
        });
      } else {
        checks.push({
          key: dbKey,
          label: dbLabel,
          ok: true,
          detail: {
            bm: "Bersambung",
            zh: "已连接",
            en: "Connected",
          },
        });
      }
    } catch (err) {
      checks.push({
        key: dbKey,
        label: dbLabel,
        ok: false,
        detail: describeDbError(
          err instanceof Error ? err.message : String(err),
        ),
      });
    }
  }

  return checks;
}

/**
 * WHO MAY SEE THIS PAGE (re-ruled by J, 2026-08-30: 「只有我可以看」).
 *
 * The old gate (D2, 2026-08-20) was "hq_admin somewhere" — written when the
 * imagined deployment was SELF-HOSTED, where the hq_admin was whoever
 * installed the thing. On the multi-tenant deployment that assumption is
 * simply false: whoever CREATES an org becomes its hq_admin
 * (orgs/actions.ts), so every signed-up user could open this page — and what
 * it prints is the NAMES of the environment variables the deployment runs on
 * (`SUPABASE_SERVICE_ROLE_KEY`, the AI key, …). Values hidden, but the list
 * of names is a map of the architecture, and a tenant has no reason to hold
 * the platform's map.
 *
 * Now: the ADMIN_EMAILS gate — the same one /admin has always used
 * (src/lib/admin-gate.ts). This page is about the DEPLOYMENT, and only the
 * platform operator runs the deployment.
 *
 * FAILS CLOSED, as before: no session, Supabase unreachable, no ADMIN_EMAILS
 * set — the answer is no. A broken deployment is exactly when its shape leaks
 * most easily; whoever looks after the server can read the environment on the
 * server.
 */
async function callerMayReadHealth(): Promise<boolean> {
  try {
    const user = await getSessionUser();
    return isOperatorEmail(user?.email);
  } catch {
    return false;
  }
}

export default async function HealthPage() {
  if (!(await callerMayReadHealth())) {
    return (
      <div className="mx-auto w-full max-w-2xl pb-12">
        <h1 className="mb-4 text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Semakan Sistem" zh="系统检查" en="System Health" />
          </span>
        </h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Tri
                bm="Halaman ini untuk pentadbir sistem"
                zh="这一页是给系统管理员看的"
                en="This page is for the system administrator"
              />
            </CardTitle>
            <CardDescription>
              <Tri
                bm="Tiada apa-apa yang salah dengan akaun anda. Halaman ini hanya menunjukkan keadaan sistem MinitAI itu sendiri, dan hanya pentadbir platform MinitAI boleh membukanya. Kalau ada sesuatu yang tidak berfungsi, hubungi pihak MinitAI."
                zh="您的帐号没有任何问题。这一页只是显示 MinitAI 这套系统本身的状态，只有 MinitAI 平台管理员打得开。如果有东西不能用，请联络 MinitAI。"
                en="There is nothing wrong with your account. This page only shows the state of the MinitAI system itself, and only the MinitAI platform administrator can open it. If something is not working, contact MinitAI."
              />
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const checks = await runChecks();
  const allOk = checks.every((check) => check.ok);

  return (
    <div className="mx-auto w-full max-w-2xl pb-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="v2-gradient-text">
            <Tri bm="Semakan Sistem" zh="系统检查" en="System Health" />
          </span>
        </h1>
        <Badge
          className={
            allOk
              ? "bg-green-600 text-white hover:bg-green-600"
              : "bg-red-600 text-white hover:bg-red-600"
          }
        >
          {allOk ? (
            "OK"
          ) : (
            <Tri bm="Masalah" zh="有问题" en="Problem" />
          )}
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        {checks.map((check) => (
          <Card key={check.key}>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="font-mono text-sm">
                  <Tri {...check.label} />
                </CardTitle>
                <Badge
                  className={
                    check.ok
                      ? "bg-green-600 text-white hover:bg-green-600"
                      : "bg-red-600 text-white hover:bg-red-600"
                  }
                >
                  {check.ok ? (
                    "OK"
                  ) : (
                    <Tri bm="Gagal" zh="失败" en="Failed" />
                  )}
                </Badge>
              </div>
              <CardDescription>
                <Tri {...check.detail} />
              </CardDescription>
            </CardHeader>
            <CardContent className="hidden" />
          </Card>
        ))}
      </div>
    </div>
  );
}
