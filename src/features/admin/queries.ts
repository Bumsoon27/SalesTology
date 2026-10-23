import "server-only";

import { createClient } from "@/shared/supabase/server";
import { fromSettingsRow, type PipelineSettings } from "@/features/deals/pipeline-settings";

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
  const { data } = await supabase.from("team_pipeline_settings").select("team_id, stage_probabilities, stale_after_days").in("team_id", teamIds);
  const rows = new Map((data ?? []).map((r) => [r.team_id as string, r]));
  return Object.fromEntries(teamIds.map((id) => [id, fromSettingsRow(rows.get(id) ?? null)]));
}
