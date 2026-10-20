// DB 행 → 우주 그래프 노드 (설계서 §6.2 '내 보기': 나 → 고객사 → 사업 → SI/매입처)
import { computeCompanyStatus, computeDealStatus, computePartyStatus } from "@/features/deals/status";
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
          // 여러 사업에 함께하는 파트너일수록 크고 밝다
          weight: Math.min(1, 0.2 + 0.2 * (shared - 1)),
          parentId: did,
          refId: p.company.id,
        });
      }
    }

    const total = logAmt(c.deals.reduce((s, d) => s + (d.amount ?? 0), 0));
    nodes.push({
      id: cid,
      kind: "customer",
      label: c.name,
      status: computeCompanyStatus(computed, today),
      weight: 0.2 + 0.8 * (total / maxCustomer),
      parentId: "me",
      refId: customerId,
    });
  }

  return { nodes };
}
