import "server-only";

import { createClient } from "@/shared/supabase/server";
import { countDeals, type DealCounts, type DealRef } from "./count";

export type PartnerRole = "customer" | "si" | "supplier";

export type Partner = {
  id: string;
  name: string;
  roles: PartnerRole[];
  contactName: string | null;
  contactInfo: string | null;
  memo: string | null;
} & DealCounts;

/** 부문 내 등록된 파트너사 (고객사·SI·매입처). userId 가 있으면 '내 사업' 수도 센다 */
export async function getPartners(userId = ""): Promise<Partner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    // 사업 수 = 고객사로 맡은 사업(deals.customer_id) + SI·매입처로 참여한 사업(deal_parties). 삭제된 사업은 뺀다
    .select(
      `id, name, partner_roles, contact_name, contact_info, memo,
       customer_deals:deals!deals_customer_id_fkey ( id, deleted_at, owner_id, source_ref ),
       deal_parties ( deal:deals ( id, deleted_at, owner_id, source_ref ) )`,
    )
    .is("deleted_at", null)
    .not("partner_roles", "eq", "{}")
    .order("name");
  if (error) throw new Error(`파트너 목록을 불러오지 못했습니다: ${error.message}`);

  type Row = {
    id: string;
    name: string;
    partner_roles: PartnerRole[];
    contact_name: string | null;
    contact_info: string | null;
    memo: string | null;
    customer_deals: DealRef[] | null;
    deal_parties: { deal: DealRef | null }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((c) => ({
    id: c.id,
    name: c.name,
    roles: c.partner_roles,
    contactName: c.contact_name,
    contactInfo: c.contact_info,
    memo: c.memo,
    ...countDeals(
      c.customer_deals ?? [],
      (c.deal_parties ?? []).map((p) => p.deal),
      userId,
    ),
  }));
}
