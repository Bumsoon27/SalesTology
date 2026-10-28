import "server-only";

import { createClient } from "@/shared/supabase/server";
import { fromSettingsRow, type PipelineSettings } from "@/features/deals/pipeline-settings";
import { coachProvider } from "@/features/deals/coach/provider";
import { todayInSeoul } from "@/features/deals/status";
import { evaluateStatus, type Check } from "./system-status";

export type AdminTeam = { id: string; name: string; joinCode: string; memberCount: number };
export type AdminUser = { id: string; loginId: string; name: string; role: "admin" | "member"; isActive: boolean; teamName: string | null; createdAt: string };
export type DeletedItem = { id: string; kind: "deal" | "company"; name: string; deletedAt: string; extra: string | null };

export async function getAdminData() {
  const supabase = await createClient();
  const [teams, users, deals, companies] = await Promise.all([
    supabase.rpc("admin_list_teams"),
    supabase.from("profiles").select("id, login_id, name, role, is_active, created_at, teams ( name )").order("created_at"),
    supabase.from("deals").select("id, name, deleted_at, customer:companies!deals_customer_id_fkey ( name )").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(50),
    supabase.from("companies").select("id, name, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(50),
  ]);
  if (teams.error) throw new Error(teams.error.message);

  const teamOf = (t: unknown) => (Array.isArray(t) ? (t[0]?.name ?? null) : ((t as { name: string } | null)?.name ?? null));

  return {
    teams: (teams.data ?? []).map((t: { id: string; name: string; join_code: string; member_count: number }) => ({
      id: t.id,
      name: t.name,
      joinCode: t.join_code,
      memberCount: Number(t.member_count),
    })) as AdminTeam[],
    users: (users.data ?? []).map((u) => ({
      id: u.id,
      loginId: u.login_id,
      name: u.name,
      role: u.role as AdminUser["role"],
      isActive: u.is_active,
      teamName: teamOf(u.teams),
      createdAt: u.created_at,
    })) as AdminUser[],
    deleted: [
      ...((deals.data ?? []) as unknown as { id: string; name: string; deleted_at: string; customer: { name: string } | null }[]).map((d) => ({
        id: d.id,
        kind: "deal" as const,
        name: d.name,
        deletedAt: d.deleted_at,
        extra: d.customer?.name ?? null,
      })),
      ...(companies.data ?? []).map((c) => ({ id: c.id, kind: "company" as const, name: c.name, deletedAt: c.deleted_at as string, extra: null })),
    ] as DeletedItem[],
  };
}

/** 부문별 파이프라인 설정 (행이 없는 부문은 기본값) */
export async function getTeamPipelineSettings(teamIds: string[]): Promise<Record<string, PipelineSettings>> {
  const supabase = await createClient();
  const { data } = await supabase.from("team_pipeline_settings").select("team_id, stage_probabilities, stale_after_days, ai_coach_enabled").in("team_id", teamIds);
  const rows = new Map((data ?? []).map((r) => [r.team_id as string, r]));
  return Object.fromEntries(teamIds.map((id) => [id, fromSettingsRow(rows.get(id) ?? null)]));
}

/** 관리자 '시스템 상태' — DB 반영·토큰 만료·연결 설정 (환경변수는 있음/없음만, 값은 읽지 않는다) */
export async function getSystemStatus(): Promise<{ checks: Check[]; tokenExpiresOn: string | null; build: string; db: string | null; commit: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_system_status");
  const s = (data ?? {}) as { latest_migration?: string | null; supabase_token_expires_on?: string | null };
  const has = (k: string) => !!process.env[k]?.trim();
  const provider = coachProvider();
  const build = process.env.BUILD_LATEST_MIGRATION ?? "";
  const checks = evaluateStatus({
    today: todayInSeoul(),
    buildMigration: build,
    dbMigration: s.latest_migration ?? null,
    tokenExpiresOn: s.supabase_token_expires_on ?? null,
    env: {
      secretKey: has("SUPABASE_SECRET_KEY"),
      naver: has("NAVER_CLIENT_ID") && has("NAVER_CLIENT_SECRET"),
      aiCoach: provider ? `${provider.kind} · ${provider.model}` : null,
      gemini: has("GEMINI_API_KEY"),
      dataGoKr: has("DATA_GO_KR_SERVICE_KEY"),
    },
  });
  return { checks, tokenExpiresOn: s.supabase_token_expires_on ?? null, build, db: s.latest_migration ?? null, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null };
}
