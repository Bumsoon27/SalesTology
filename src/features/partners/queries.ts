import "server-only";

import { createClient } from "@/shared/supabase/server";
import { countDeals, type DealCounts, type DealRef } from "./count";
import { mergeDeals, type CompanyDeal, type CompanyRole } from "./detail";
import type { NoteKind } from "@/features/deals/notes";

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

export type CompanyNote = { id: string; dealId: string; dealName: string; kind: NoteKind; body: string; occurredOn: string; counterpart: string | null; author: string };

export type CompanyDetail = {
  id: string;
  name: string;
  roles: PartnerRole[];
  contactName: string | null;
  contactInfo: string | null;
  memo: string | null;
  deals: CompanyDeal[];
  notes: CompanyNote[];
};

const COMPANY_DEAL = "id, name, stage, status, amount, gp, owner_id, last_activity_at, deleted_at, owner:profiles!deals_owner_id_fkey ( name )";

/** 고객사 상세 — 사용자 권한(RLS)으로 읽는다. 볼 수 있는 사업만 나온다. 없거나 볼 수 없으면 null */
export async function getCompanyDetail(id: string): Promise<CompanyDetail | null> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("companies")
    .select("id, name, partner_roles, contact_name, contact_info, memo")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!c) return null;

  type RawDeal = { id: string; name: string; stage: CompanyDeal["stage"]; status: CompanyDeal["status"]; amount: number | null; gp: number | null; owner_id: string; last_activity_at: string; deleted_at: string | null; owner: { name: string } | null };
  const [asCustomer, asParty] = await Promise.all([
    supabase.from("deals").select(COMPANY_DEAL).eq("customer_id", id).is("deleted_at", null).limit(500),
    supabase.from("deal_parties").select(`role, deal:deals ( ${COMPANY_DEAL} )`).eq("company_id", id).limit(500),
  ]);
  const toDeal = (r: RawDeal, role: CompanyRole): CompanyDeal => ({
    id: r.id,
    name: r.name,
    stage: r.stage,
    status: r.status,
    amount: r.amount == null ? null : Number(r.amount),
    gp: r.gp == null ? null : Number(r.gp),
    ownerId: r.owner_id,
    owner: r.owner?.name ?? "-",
    lastActivityAt: r.last_activity_at,
    roles: [role],
  });
  const deals = mergeDeals([
    ...((asCustomer.data ?? []) as unknown as RawDeal[]).map((r) => toDeal(r, "customer")),
    ...((asParty.data ?? []) as unknown as { role: "si" | "supplier"; deal: RawDeal | null }[])
      .filter((p) => p.deal && !p.deal.deleted_at)
      .map((p) => toDeal(p.deal as RawDeal, p.role)),
  ]);

  let notes: CompanyNote[] = [];
  if (deals.length) {
    const names = new Map(deals.map((d) => [d.id, d.name]));
    const { data } = await supabase
      .from("deal_notes")
      .select("id, deal_id, kind, body, occurred_on, counterpart, author:profiles ( name )")
      .in("deal_id", [...names.keys()].slice(0, 200))
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);
    type RawNote = { id: string; deal_id: string; kind: NoteKind; body: string; occurred_on: string; counterpart: string | null; author: { name: string } | null };
    notes = ((data ?? []) as unknown as RawNote[]).map((n) => ({
      id: n.id,
      dealId: n.deal_id,
      dealName: names.get(n.deal_id) ?? "",
      kind: n.kind,
      body: n.body,
      occurredOn: n.occurred_on,
      counterpart: n.counterpart,
      author: n.author?.name ?? "-",
    }));
  }

  return {
    id: c.id,
    name: c.name,
    roles: c.partner_roles as PartnerRole[],
    contactName: c.contact_name,
    contactInfo: c.contact_info,
    memo: c.memo,
    deals,
    notes,
  };
}
