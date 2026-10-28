// 단계별 전환(퍼널) — 사업이 한 번이라도 도달한 가장 높은 단계로 센다. 순수 함수 (테스트: funnel.test.ts)
// 도달 = 지금 단계 또는 변경 이력의 이후 단계 중 가장 높은 것. 실주한 사업도 거기까지는 도달한 것으로 센다
import type { DealStage } from "@/features/deals/types";
import type { DealEvent, ReportDeal } from "./report";

export const FUNNEL: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won"];
const ORDER: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won", "fulfillment", "billing"];
const rank = (s: unknown) => ORDER.indexOf(s as DealStage);

export type FunnelRow = { stage: DealStage; reached: number; pct: number; stepPct: number | null };

export function funnel(deals: ReportDeal[], events: DealEvent[], since: string): FunnelRow[] {
  const top = new Map<string, number>();
  for (const d of deals) if (d.created_at.slice(0, 10) >= since) top.set(d.id, rank(d.stage));
  for (const e of events) {
    if (!top.has(e.deal_id)) continue;
    const r = Math.max(rank(e.after?.stage), rank(e.before?.stage));
    if (r > (top.get(e.deal_id) ?? -1)) top.set(e.deal_id, r);
  }
  const total = top.size;
  // 수주 이후(이행·빌링)는 '수주'에 포함
  const reached = FUNNEL.map((s) => [...top.values()].filter((r) => r >= rank(s)).length);
  return FUNNEL.map((stage, i) => ({
    stage,
    reached: reached[i],
    pct: total ? Math.round((reached[i] / total) * 100) : 0,
    stepPct: i === 0 ? null : reached[i - 1] ? Math.round((reached[i] / reached[i - 1]) * 100) : null,
  }));
}
