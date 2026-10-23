// DB 행 → 우주 그래프 노드 (설계서 §6.2 '내 보기': 나 → 고객사 → 사업 → SI/매입처)
import { computeCompanyStatus, computeDealStatus, computePartyStatus } from "@/features/deals/status";
import { strengthByCompany } from "@/features/deals/relationship";
import { STAGE_LABEL, type DealRow } from "@/features/deals/types";
import type { UniverseData, UniverseNode } from "./types";

export function buildMyUniverse(me: { id: string; name: string }, deals: DealRow[], today: string): UniverseData {
  const nodes: UniverseNode[] = [{ id: "me", kind: "me", label: me.name, status: "green", weight: 1, parentId: null }];
  const visible = deals.filter((d) => d.status === "active" || d.status === "on_hold");

  // 크기: 금액 로그 스케일, 가장 큰 값 기준 0~1
  const logAmt = (a: number | null) => Math.log10(1 + (a ?? 0));
  const maxDeal = Math.max(1, ...visible.map((d) => logAmt(d.amount)));

  const byCustomer = new Map<string, { name: string; deals: DealRow[] }>();
  for (const d of visible) {
    const c = byCustomer.get(d.customer.id) ?? { name: d.customer.name, deals: [] };
    c.deals.push(d);
    byCustomer.set(d.customer.id, c);
  }
  const customerTotals = [...byCustomer.values()].map((c) => logAmt(c.deals.reduce((s, d) => s + (d.amount ?? 0), 0)));
  const maxCustomer = Math.max(1, ...customerTotals);

  // 관계 강도 (최근성·빈도) — 회사 노드의 밝기·크기에 40% 섞는다. 금액·참여 수가 같아도 최근에 자주 만난 회사가 더 빛난다
  const strength = strengthByCompany(visible, today);
  const blend = (base: number, companyId: string) => Math.min(1, 0.6 * base + 0.4 * ((strength.get(companyId)?.score ?? 0) / 100));

  // 파트너별 참여 사업 수 (연관도)
  const partnerDealCount = new Map<string, number>();
  for (const d of visible) {
    for (const id of new Set(d.deal_parties.map((p) => p.company.id))) {
      partnerDealCount.set(id, (partnerDealCount.get(id) ?? 0) + 1);
    }
  }

  for (const [customerId, c] of byCustomer) {
    const cid = `c:${customerId}`;
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
        weight: 0.25 + 0.75 * (logAmt(d.amount) / maxDeal),
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
      weight: blend(0.2 + 0.8 * (total / maxCustomer), customerId),
      parentId: "me",
      refId: customerId,
      strength: strength.get(customerId)?.score,
      strengthLastOn: strength.get(customerId)?.lastOn ?? null,
    });
  }

  return { nodes };
}
