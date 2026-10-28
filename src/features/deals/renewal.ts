// 계약 만료 갱신 — 언제 제안하고, 갱신 사업을 어떻게 채우는지. 순수 함수 (테스트: renewal.test.ts)
// 갱신 사업은 출처 참조 'renewal:<원 사업 id>' 로 만들어 같은 사업의 갱신이 두 번 생기지 않는다 (create_deal 멱등)
import { daysUntil } from "./status";
import type { DealStage } from "./types";

/** 계약 종료 이 기간(일) 안이면 갱신을 제안 */
export const RENEWAL_LEAD_DAYS = 90;
const WON_OR_LATER = new Set<DealStage>(["won", "fulfillment", "billing"]);

export const renewalRef = (dealId: string) => `renewal:${dealId}`;

export function needsRenewal(d: { stage: DealStage; period_end?: string | null }, today: string, hasRenewal: boolean): number | null {
  if (hasRenewal || !d.period_end || !WON_OR_LATER.has(d.stage)) return null;
  const left = daysUntil(d.period_end, today);
  return left >= -30 && left <= RENEWAL_LEAD_DAYS ? left : null; // 끝난 지 30일까지는 계속 제안
}

/** 다음 계약 기간 = 종료 다음 날부터 1년 (윤년 2/29 시작이면 2/28 까지) */
export function nextPeriod(periodEnd: string): { start: string; end: string } {
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const start = new Date(end.getTime() + 86_400_000);
  const next = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()));
  if (next.getUTCMonth() !== start.getUTCMonth()) next.setUTCDate(0); // 2/29 → 2/28
  next.setUTCDate(next.getUTCDate() - 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(next) };
}

export function renewalName(name: string, nextStart: string): string {
  const base = name.replace(/\s*\(\d{4}년? ?갱신\)\s*$/, "").trim();
  return `${base} (${nextStart.slice(0, 4)} 갱신)`.slice(0, 200);
}
