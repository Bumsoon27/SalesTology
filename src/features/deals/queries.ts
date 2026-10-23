import "server-only";

import { cache } from "react";
import { createClient } from "@/shared/supabase/server";
import type { DealRow } from "./types";

const DEAL_SELECT = `
  id, name, stage, status, amount, gp, last_activity_at, period_end,
  customer:companies!deals_customer_id_fkey ( id, name ),
  deal_parties ( id, role, via_party_id, company:companies ( id, name ) ),
  deal_tasks ( id, type, title, company_id, due_date, done_at, excluded_reason, deleted_at ),
  issues ( id, title, status )
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

/** 회사명 자동완성용 (부문 내) */
export async function getCompanyNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("name").is("deleted_at", null).order("name").limit(500);
  return (data ?? []).map((c) => c.name);
}

export type TeamDeal = Pick<DealRow, "id" | "name" | "stage" | "status" | "amount" | "gp" | "last_activity_at" | "customer"> & {
  owner_id: string;
  owner: string;
};

/** 부문 보기: 내 부문의 진행 중 사업 (금액 요약용 가벼운 조회). 범위는 RLS 가 부문으로 막는다 */
export async function getTeamDeals(teamId: string): Promise<TeamDeal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select("id, name, stage, status, amount, gp, last_activity_at, owner_id, customer:companies!deals_customer_id_fkey ( id, name ), owner:profiles!deals_owner_id_fkey ( name )")
    .eq("team_id", teamId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(2000);
  if (error) throw new Error(`부문 사업을 불러오지 못했습니다: ${error.message}`);
  type Raw = Omit<TeamDeal, "owner"> & { owner: { name: string } | null };
  return ((data ?? []) as unknown as Raw[]).map((d) => ({ ...d, owner: d.owner?.name ?? "-" }));
}
