import "server-only";

// 실적 리포트 데이터 — 사용자 권한(RLS)으로 읽는다 (같은 부문만). 지난 400일 이력
import { createClient } from "@/shared/supabase/server";
import type { DealEvent, ReportDeal } from "./report";
import type { MonthTarget } from "./targets";
import type { CompetitorEntry } from "@/features/deals/competitors/competitors";

export async function getReportData(teamId: string): Promise<{ deals: ReportDeal[]; events: DealEvent[] }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const [deals, events] = await Promise.all([
    supabase
      .from("deals")
      .select("id, name, stage, status, amount, gp, created_at, owner_id, owner:profiles!deals_owner_id_fkey ( name ), customer:companies!deals_customer_id_fkey ( name )")
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .limit(5000),
    supabase
      .from("activity_log")
      .select("deal_id, action, before, after, created_at")
      .eq("team_id", teamId)
      .eq("entity_type", "deal")
      .in("action", ["create", "stage_change", "update"])
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(20000),
  ]);
  if (deals.error) throw new Error(`실적을 불러오지 못했습니다: ${deals.error.message}`);
  type Raw = Omit<ReportDeal, "owner"> & { owner: { name: string } | null };
  return {
    deals: ((deals.data ?? []) as unknown as Raw[]).map((d) => ({ ...d, owner: d.owner?.name ?? "-" })),
    events: (events.data ?? []) as DealEvent[],
  };
}

/** 월 목표 — 부문 목표(ownerId null) 또는 한 사람의 개인 목표, 그 해 */
export async function getTargets(teamId: string, ownerId: string | null, year: number): Promise<MonthTarget[]> {
  const supabase = await createClient();
  let q = supabase.from("sales_targets").select("month, amount").eq("team_id", teamId).gte("month", `${year}-01-01`).lte("month", `${year}-12-01`);
  q = ownerId ? q.eq("owner_id", ownerId) : q.is("owner_id", null);
  const { data } = await q.order("month");
  return ((data ?? []) as { month: string; amount: number }[]).map((t) => ({ month: t.month, amount: Number(t.amount) }));
}

/** 경쟁사 기록 — 같은 부문 사업(삭제 제외)의 경쟁사. 사용자 권한(RLS) */
export async function getCompetitorEntries(teamId: string): Promise<CompetitorEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deal_competitors")
    .select("deal_id, name, is_winner, deal:deals!inner ( team_id, deleted_at )")
    .eq("deal.team_id", teamId)
    .is("deal.deleted_at", null)
    .limit(5000);
  return ((data ?? []) as unknown as { deal_id: string; name: string; is_winner: boolean }[]).map((r) => ({ dealId: r.deal_id, name: r.name, isWinner: r.is_winner }));
}
