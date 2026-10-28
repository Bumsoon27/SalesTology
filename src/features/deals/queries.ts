import "server-only";

import { cache } from "react";
import { createClient } from "@/shared/supabase/server";
import type { DealRow } from "./types";
import { DEFAULT_PIPELINE_SETTINGS, fromSettingsRow, type PipelineSettings } from "./pipeline-settings";

const DEAL_SELECT = `
  id, name, stage, status, amount, gp, last_activity_at, period_start, period_end, updated_at, contract_type, source_ref, lost_reason,
  customer:companies!deals_customer_id_fkey ( id, name ),
  deal_parties ( id, role, via_party_id, company:companies ( id, name ) ),
  deal_tasks ( id, type, title, company_id, due_date, done_at, excluded_reason, deleted_at ),
  issues ( id, title, status ),
  deal_notes ( kind, occurred_on, counterpart ),
  deal_competitors ( id )
`;

/** 내 보기: 내가 담당한 사업 (RLS가 부문 범위를 한 번 더 막는다). 헤더 티커·대시보드가 한 요청에서 같이 쓴다 */
export const getMyDeals = cache(async (userId: string): Promise<DealRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_SELECT)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`사업 목록을 불러오지 못했습니다: ${error.message}`);

  type RawTask = DealRow["deal_tasks"][number] & { deleted_at: string | null };
  type RawDeal = Omit<DealRow, "deal_tasks"> & { deal_tasks: RawTask[] };

  return ((data ?? []) as unknown as RawDeal[]).map((row) => ({
    ...row,
    deal_tasks: row.deal_tasks.filter((t) => !t.deleted_at),
  }));
});

/** 부문 보기: 부문의 모든 사업 + 영업대표 이름 (대시보드 우주·파이프라인 보드). 범위는 RLS 가 부문으로 한 번 더 막는다 */
export const getTeamDealsFull = cache(async (teamId: string): Promise<(DealRow & { owner_id: string; owner: string })[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select(`${DEAL_SELECT}, owner_id, owner:profiles!deals_owner_id_fkey ( name )`)
    .eq("team_id", teamId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`부문 사업을 불러오지 못했습니다: ${error.message}`);

  type RawTask = DealRow["deal_tasks"][number] & { deleted_at: string | null };
  type RawDeal = Omit<DealRow, "deal_tasks"> & { deal_tasks: RawTask[]; owner_id: string; owner: { name: string } | null };

  return ((data ?? []) as unknown as RawDeal[]).map((row) => ({
    ...row,
    owner: row.owner?.name ?? "-",
    deal_tasks: row.deal_tasks.filter((t) => !t.deleted_at),
  }));
});

/** 부문의 활성 영업대표 (조회 범위 선택용) */
export const getTeamMembers = cache(async (teamId: string): Promise<{ id: string; name: string }[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, name").eq("team_id", teamId).eq("is_active", true).order("name");
  return (data ?? []) as { id: string; name: string }[];
});

/** 회사명 자동완성용 (부문 내) */
export async function getCompanyNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("name").is("deleted_at", null).order("name").limit(500);
  return (data ?? []).map((c) => c.name);
}

/** 부문 파이프라인 설정 (없으면 기본값). 부문이 없으면(관리자) 기본값 */
export const getPipelineSettings = cache(async (teamId: string | null): Promise<PipelineSettings> => {
  if (!teamId) return DEFAULT_PIPELINE_SETTINGS;
  const supabase = await createClient();
  const { data } = await supabase.from("team_pipeline_settings").select("stage_probabilities, stale_after_days, ai_coach_enabled").eq("team_id", teamId).maybeSingle();
  return fromSettingsRow(data);
});
