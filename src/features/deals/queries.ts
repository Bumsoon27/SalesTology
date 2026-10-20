import "server-only";

import { createClient } from "@/shared/supabase/server";
import type { DealRow } from "./types";

const DEAL_SELECT = `
  id, name, stage, status, amount, last_activity_at,
  customer:companies!deals_customer_id_fkey ( id, name ),
  deal_parties ( id, role, via_party_id, company:companies ( id, name ) ),
  deal_tasks ( id, type, title, company_id, due_date, done_at, excluded_reason, deleted_at ),
  issues ( id, title, status )
`;

/** 내 보기: 내가 담당한 사업 (RLS가 부문 범위를 한 번 더 막는다) */
export async function getMyDeals(userId: string): Promise<DealRow[]> {
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
}

/** 회사명 자동완성용 (부문 내) */
export async function getCompanyNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("name").is("deleted_at", null).order("name").limit(500);
  return (data ?? []).map((c) => c.name);
}
