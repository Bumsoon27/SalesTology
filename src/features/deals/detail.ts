"use server";

// 우주에서 노드를 누르면 왼쪽 패널에 보여줄 상세 (설계서 §6.5). RLS가 부문 범위를 막는다.
import { createClient } from "@/shared/supabase/server";
import { computeDealStatus, todayInSeoul, type StatusResult } from "./status";
import { isFromSos, type DealRow, type DealStage, type IssueRow, type PartyRow, type TaskRow } from "./types";

export type ActivityItem = { id: number; action: string; entity: string; after: Record<string, unknown> | null; at: string; actor: string | null };

export type DealDetail = {
  kind: "deal";
  id: string;
  name: string;
  stage: DealStage;
  status: DealRow["status"];
  /** 동시 수정 감지용 */
  updatedAt: string;
  /** 마지막 활동 시각 (정체 판단) */
  lastActivityAt: string;
  contractType: "competitive" | "negotiated";
  amount: number | null;
  gp: number | null;
  expectedMonth: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  items: string | null;
  /** SOS 리드에서 전환된 사업 */
  fromSos: boolean;
  owner: string | null;
  customer: { id: string; name: string };
  parties: PartyRow[];
  tasks: TaskRow[];
  issues: IssueRow[];
  computed: StatusResult;
  activity: ActivityItem[];
  /** 서버 기준 오늘 (Asia/Seoul) */
  today: string;
};

export type CompanyDetail = {
  kind: "company";
  id: string;
  name: string;
  roles: string[];
  memo: string | null;
  contact: string | null;
  deals: {
    id: string;
    name: string;
    stage: DealStage;
    status: DealRow["status"];
    asRole: "customer" | "si" | "supplier";
    owner: string | null;
    fromSos: boolean;
  }[];
};

export type NodeDetail = DealDetail | CompanyDetail | { kind: "none" };

export async function loadNodeDetail(nodeId: string, refId?: string): Promise<NodeDetail> {
  const supabase = await createClient();

  if (nodeId.startsWith("d:")) {
    const id = nodeId.slice(2);
    const [{ data: d, error }, { data: log }] = await Promise.all([
      supabase
        .from("deals")
        .select(`id, name, stage, status, contract_type, updated_at, amount, gp, expected_contract_month, period_start, period_end, items, source_ref, last_activity_at,
          owner:profiles!deals_owner_id_fkey ( name ),
          customer:companies!deals_customer_id_fkey ( id, name ),
          deal_parties ( id, role, via_party_id, company:companies ( id, name ) ),
          deal_tasks ( id, type, title, company_id, due_date, done_at, excluded_reason, deleted_at ),
          issues ( id, title, status )`)
        .eq("id", id)
        .single(),
      supabase
        .from("activity_log")
        .select("id, action, entity_type, after, created_at, actor:profiles ( name )")
        .eq("deal_id", id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    if (error || !d) return { kind: "none" };

    const row = d as unknown as Omit<DealRow, "deal_tasks"> & {
      contract_type: DealDetail["contractType"];
      updated_at: string;
      gp: number | null;
      expected_contract_month: string | null;
      source_ref: string | null;
      period_start: string | null;
      period_end: string | null;
      items: string | null;
      owner: { name: string } | null;
      deal_tasks: (TaskRow & { deleted_at: string | null })[];
    };
    const today = todayInSeoul();
    const tasks = row.deal_tasks.filter((t) => !t.deleted_at).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    return {
      kind: "deal",
      id: row.id,
      name: row.name,
      stage: row.stage,
      status: row.status,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at,
      contractType: row.contract_type,
      amount: row.amount,
      gp: row.gp,
      expectedMonth: row.expected_contract_month,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      items: row.items,
      fromSos: isFromSos(row.source_ref),
      owner: row.owner?.name ?? null,
      customer: row.customer,
      parties: row.deal_parties,
      tasks,
      issues: row.issues,
      computed: computeDealStatus({ ...row, deal_tasks: tasks }, today),
      today,
      activity: ((log ?? []) as unknown as { id: number; action: string; entity_type: string; after: Record<string, unknown> | null; created_at: string; actor: { name: string } | null }[]).map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity_type,
        after: a.after,
        at: a.created_at,
        actor: a.actor?.name ?? null,
      })),
    };
  }

  // 고객사·파트너: 회사 기준으로 보여준다
  const companyId = refId;
  if (!companyId) return { kind: "none" };
  const [{ data: c }, { data: asCustomer }, { data: asParty }] = await Promise.all([
    supabase.from("companies").select("id, name, partner_roles, memo, contact_name, contact_info").eq("id", companyId).single(),
    supabase
      .from("deals")
      .select("id, name, stage, status, source_ref, owner:profiles!deals_owner_id_fkey ( name )")
      .eq("customer_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("deal_parties")
      .select("role, deal:deals ( id, name, stage, status, deleted_at, source_ref, owner:profiles!deals_owner_id_fkey ( name ) )")
      .eq("company_id", companyId),
  ]);
  if (!c) return { kind: "none" };

  type MiniDeal = {
    id: string;
    name: string;
    stage: DealStage;
    status: DealRow["status"];
    deleted_at?: string | null;
    source_ref: string | null;
    owner: { name: string } | null;
  };
  const mini = (d: MiniDeal, asRole: CompanyDetail["deals"][number]["asRole"]) => ({
    id: d.id,
    name: d.name,
    stage: d.stage,
    status: d.status,
    asRole,
    owner: d.owner?.name ?? null,
    fromSos: isFromSos(d.source_ref),
  });
  const deals: CompanyDetail["deals"] = [
    ...((asCustomer ?? []) as unknown as MiniDeal[]).map((d) => mini(d, "customer")),
    ...((asParty ?? []) as unknown as { role: "si" | "supplier"; deal: MiniDeal | null }[])
      .filter((p) => p.deal && !p.deal.deleted_at)
      .map((p) => mini(p.deal!, p.role)),
  ];
  return {
    kind: "company",
    id: c.id,
    name: c.name,
    roles: c.partner_roles as string[],
    memo: c.memo,
    contact: [c.contact_name, c.contact_info].filter(Boolean).join(" · ") || null,
    deals,
  };
}
