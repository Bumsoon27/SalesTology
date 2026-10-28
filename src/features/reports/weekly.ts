// 주간 브리핑 — 이번 주(월~오늘) vs 지난주 같은 기간. 순수 함수 (테스트: weekly.test.ts)
// 수주·실주는 computeOutcomes 결과, 신규·단계 진전은 등록일·변경 이력으로 센다
import { seoulDay } from "@/features/deals/status";
import type { DealStage } from "@/features/deals/types";
import type { DealEvent, Loss, ReportDeal, Win } from "./report";

const ORDER: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won", "fulfillment", "billing"];
const rank = (s: unknown) => ORDER.indexOf(s as DealStage);

export type Week = { from: string; to: string };
export type WeekStats = { won: number; wonAmount: number; lost: number; created: number; advanced: number };
export type Advance = { dealId: string; name: string; customer: string; from: DealStage; to: DealStage; on: string };

const DAY = 86_400_000;
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** 이번 주(월요일~오늘)와 지난주 같은 요일까지 — 공정한 비교를 위해 지난주도 같은 일수만 */
export function weeks(today: string): { thisWeek: Week; lastWeek: Week } {
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0
  const monday = shift(today, -dow);
  return { thisWeek: { from: monday, to: today }, lastWeek: { from: shift(monday, -7), to: shift(today, -7) } };
}

const inW = (d: string, w: Week) => d >= w.from && d <= w.to;

/** 단계가 앞으로 나아간 이력 (같은 사업이 한 주에 여러 번 나아가면 처음 단계 → 마지막 단계로 합친다) */
export function advances(deals: ReportDeal[], events: DealEvent[], w: Week): Advance[] {
  const byId = new Map(deals.map((d) => [d.id, d]));
  const map = new Map<string, Advance>();
  for (const e of events) {
    if (e.action !== "stage_change") continue;
    const on = seoulDay(e.created_at);
    if (!inW(on, w)) continue;
    const d = byId.get(e.deal_id);
    const from = e.before?.stage as DealStage;
    const to = e.after?.stage as DealStage;
    if (!d || rank(from) < 0 || rank(to) <= rank(from)) continue;
    const prev = map.get(d.id);
    map.set(d.id, prev ? { ...prev, to: rank(to) > rank(prev.to) ? to : prev.to, on } : { dealId: d.id, name: d.name, customer: d.customer.name, from, to, on });
  }
  // 지금 단계가 그보다 뒤로 되돌아갔으면 제외
  return [...map.values()].filter((a) => rank(byId.get(a.dealId)?.stage) >= rank(a.to)).sort((a, b) => b.on.localeCompare(a.on));
}

export function weekStats(deals: ReportDeal[], events: DealEvent[], wins: Win[], losses: Loss[], w: Week): WeekStats {
  const ws = wins.filter((x) => inW(x.on, w));
  return {
    won: ws.length,
    wonAmount: ws.reduce((s, x) => s + x.amount, 0),
    lost: losses.filter((x) => inW(x.on, w)).length,
    created: deals.filter((d) => inW(seoulDay(d.created_at), w)).length,
    advanced: advances(deals, events, w).length,
  };
}
