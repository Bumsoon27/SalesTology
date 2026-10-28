// 단계별 전환(퍼널) — 사업이 한 번이라도 도달한 가장 높은 단계로 센다. 순수 함수 (테스트: funnel.test.ts)
// 도달 = 지금 단계 또는 변경 이력의 이후 단계 중 가장 높은 것. 실주한 사업도 거기까지는 도달한 것으로 센다
// 입찰 단계는 경쟁입찰 사업만 센다 (수의계약은 입찰이 없다). 수주의 '앞 단계 대비'는 협상 대비
import type { DealStage } from "@/features/deals/types";
import type { DealEvent, ReportDeal } from "./report";

export const FUNNEL: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won"];
const ORDER: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won", "fulfillment", "billing"];
const rank = (s: unknown) => ORDER.indexOf(s as DealStage);

export type FunnelRow = { stage: DealStage; reached: number; pct: number; stepPct: number | null };

export function funnel(deals: ReportDeal[], events: DealEvent[], since: string): FunnelRow[] {
  const top = new Map<string, number>();
  const competitive = new Set<string>();
  for (const d of deals) {
    if (d.created_at.slice(0, 10) < since) continue;
    top.set(d.id, rank(d.stage));
    if (d.contract_type !== "negotiated") competitive.add(d.id);
  }
  for (const e of events) {
    if (!top.has(e.deal_id)) continue;
    const r = Math.max(rank(e.after?.stage), rank(e.before?.stage));
    if (r > (top.get(e.deal_id) ?? -1)) top.set(e.deal_id, r);
  }
  const total = top.size;
  // 수주 이후(이행·빌링)는 '수주'에 포함
  const entries = [...top.entries()];
  const reached = FUNNEL.map((s) => entries.filter(([id, r]) => r >= rank(s) && (s !== "bidding" || competitive.has(id))).length);
  const bid = FUNNEL.indexOf("bidding");
  return FUNNEL.map((stage, i) => {
    const prev = i === 0 ? null : stage === "won" ? reached[bid - 1] : stage === "bidding" ? entries.filter(([id, r]) => competitive.has(id) && r >= rank("negotiation")).length : reached[i - 1];
    return {
      stage,
      reached: reached[i],
      pct: total ? Math.round((reached[i] / total) * 100) : 0,
      stepPct: prev == null ? null : prev ? Math.round((reached[i] / prev) * 100) : null,
    };
  });
}
