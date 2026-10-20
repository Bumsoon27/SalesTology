import "server-only";

import { createClient } from "@/shared/supabase/server";

export type PartnerRole = "si" | "supplier";

export type Partner = {
  id: string;
  name: string;
  roles: PartnerRole[];
  contactName: string | null;
  contactInfo: string | null;
  memo: string | null;
  dealCount: number;
};

/** 부문 내 등록된 파트너사 (SI·매입처) */
export async function getPartners(): Promise<Partner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, partner_roles, contact_name, contact_info, memo, deal_parties ( deal_id )")
    .is("deleted_at", null)
    .not("partner_roles", "eq", "{}")
    .order("name");
  if (error) throw new Error(`파트너 목록을 불러오지 못했습니다: ${error.message}`);

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    roles: c.partner_roles as PartnerRole[],
    contactName: c.contact_name,
    contactInfo: c.contact_info,
    memo: c.memo,
    dealCount: new Set((c.deal_parties as { deal_id: string }[]).map((p) => p.deal_id)).size,
  }));
}
