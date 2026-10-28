// DB 행 → 우주 그래프 노드 (설계서 §6.2)
//  개인 보기: 나 → 고객사 → 사업 → SI/매입처
//  부문 보기: 부문 → 영업대표 → 고객사 → 사업 → SI/매입처
import { computeCompanyStatus, computeDealStatus, computePartyStatus } from "@/features/deals/status";
import { strengthByCompany } from "@/features/deals/relationship";
import { STAGE_LABEL, type DealRow } from "@/features/deals/types";
import type { NodeStatus, UniverseData, UniverseNode } from "./types";

const logAmt = (a: number | null) => Math.log10(1 + (a ?? 0));
const visibleDeals = (deals: DealRow[]) => deals.filter((d) => d.status === "active" || d.status === "on_hold");

/**
 * 한 사람(또는 부문 안 한 영업대표)의 고객사 가지를 붙인다.
 * idPrefix 로 고객사 노드 id 를 사람마다 다르게 해서, 같은 고객사를 두 영업대표가 맡아도 각자 가지에 나타난다 (refId 는 같은 회사).
 */
function addBranches(nodes: UniverseNode[], parentId: string, deals: DealRow[], today: string, scale: { maxDeal: number; maxCustomer: number }, idPrefix: string) {
  // 관계 강도 (최근성·빈도) — 회사 노드의 밝기·크기에 40% 섞는다. 금액·참여 수가 같아도 최근에 자주 만난 회사가 더 빛난다
  const strength = strengthByCompany(deals, today);
  const blend = (base: number, companyId: string) => Math.min(1, 0.6 * base + 0.4 * ((strength.get(companyId)?.score ?? 0) / 100));

  const byCustomer = new Map<string, { name: string; deals: DealRow[] }>();
  for (const d of deals) {
    const c = byCustomer.get(d.customer.id) ?? { name: d.customer.name, deals: [] };
    c.deals.push(d);
    byCustomer.set(d.customer.id, c);
  }

  // 파트너별 참여 사업 수 (연관도)
  const partnerDealCount = new Map<string, number>();
  for (const d of deals) {
    for (const id of new Set(d.deal_parties.map((p) => p.company.id))) {
      partnerDealCount.set(id, (partnerDealCount.get(id) ?? 0) + 1);
    }
  }

  for (const [customerId, c] of byCustomer) {
    const cid = `c:${idPrefix}${customerId}`;
    const computed: { status: DealRow["status"]; last_activity_at: string; computed: UniverseNode["status"] }[] = [];

    for (const d of c.deals) {
      const st = computeDealStatus(d, today);
      computed.push({ status: d.status, last_activity_at: d.last_activity_at, computed: st.status });
      const did = `d:${d.id}`;
      nodes.push({
        id: did,
        kind: "deal",
        label: `${d.name} · ${STAGE_LABEL[d.stage]}`,
        status: st.status,
        reason: st.reason,
        weight: 0.25 + 0.75 * (logAmt(d.amount) / scale.maxDeal),
        parentId: cid,
      });
      for (const p of d.deal_parties) {
        const ps = computePartyStatus(d.deal_tasks, p.company.id, today);
        const shared = partnerDealCount.get(p.company.id) ?? 1;
        nodes.push({
          id: `p:${p.id}`,
          kind: "party",
          label: `${p.company.name} · ${p.role === "si" ? "SI" : "매입"}${shared > 1 ? ` · ${shared}건` : ""}`,
          status: ps.status,
          reason: ps.reason,
          // 여러 사업에 함께하고, 최근 상호작용이 많은 파트너일수록 크고 밝다
          weight: blend(Math.min(1, 0.2 + 0.2 * (shared - 1)), p.company.id),
          parentId: did,
          refId: p.company.id,
          strength: strength.get(p.company.id)?.score,
          strengthLastOn: strength.get(p.company.id)?.lastOn ?? null,
        });
      }
    }

    const total = logAmt(c.deals.reduce((s, d) => s + (d.amount ?? 0), 0));
    nodes.push({
      id: cid,
      kind: "customer",
      label: c.name,
      status: computeCompanyStatus(computed, today),
      weight: blend(0.2 + 0.8 * (total / scale.maxCustomer), customerId),
      parentId,
      refId: customerId,
      strength: strength.get(customerId)?.score,
      strengthLastOn: strength.get(customerId)?.lastOn ?? null,
    });
  }
}

function scaleOf(deals: DealRow[], customerKey: (d: DealRow) => string) {
  const totals = new Map<string, number>();
  for (const d of deals) totals.set(customerKey(d), (totals.get(customerKey(d)) ?? 0) + (d.amount ?? 0));
  return {
    maxDeal: Math.max(1, ...deals.map((d) => logAmt(d.amount))),
    maxCustomer: Math.max(1, ...[...totals.values()].map(logAmt)),
  };
}

export function buildMyUniverse(me: { id: string; name: string }, deals: DealRow[], today: string): UniverseData {
  const nodes: UniverseNode[] = [{ id: "me", kind: "me", label: me.name, status: "green", weight: 1, parentId: null }];
  const visible = visibleDeals(deals);
  addBranches(nodes, "me", visible, today, scaleOf(visible, (d) => d.customer.id), "");
  return { nodes };
}

export type TeamDealRow = DealRow & { owner_id: string; owner: string };

const WORST: NodeStatus[] = ["red", "yellow", "green", "hold", "grey"];

/** 부문 보기: 가운데 부문, 첫 궤도에 영업대표(사업 규모가 클수록 크게), 그 바깥에 각자의 고객사·사업 */
export function buildTeamUniverse(team: { name: string }, deals: TeamDealRow[], today: string): UniverseData {
  const nodes: UniverseNode[] = [{ id: "me", kind: "me", label: team.name, status: "green", weight: 1, parentId: null }];
  const visible = visibleDeals(deals) as TeamDealRow[];
  const scale = scaleOf(visible, (d) => `${(d as TeamDealRow).owner_id}:${d.customer.id}`);

  const byOwner = new Map<string, { name: string; deals: TeamDealRow[] }>();
  for (const d of visible) {
    const o = byOwner.get(d.owner_id) ?? { name: d.owner, deals: [] };
    o.deals.push(d);
    byOwner.set(d.owner_id, o);
  }
  const maxOwner = Math.max(1, ...[...byOwner.values()].map((o) => logAmt(o.deals.reduce((s, d) => s + (d.amount ?? 0), 0))));

  for (const [ownerId, o] of byOwner) {
    const mid = `m:${ownerId}`;
    // 영업대표 색: 맡은 사업 중 가장 급한 상태
    const statuses = o.deals.map((d) => computeDealStatus(d, today).status);
    const status = WORST.find((s) => statuses.includes(s)) ?? "green";
    const total = o.deals.reduce((s, d) => s + (d.amount ?? 0), 0);
    nodes.push({
      id: mid,
      kind: "member",
      label: `${o.name} · ${o.deals.length}건`,
      status,
      weight: 0.3 + 0.7 * (logAmt(total) / maxOwner),
      parentId: "me",
    });
    addBranches(nodes, mid, o.deals, today, scale, `${ownerId}:`);
  }
  return { nodes };
}
