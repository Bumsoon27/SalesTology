// 목표(쿼터)·달성률 — 순수 함수 (테스트: targets.test.ts)
// 목표는 월 단위로 저장하고, 분기·연간은 그 기간의 월 목표를 더한다
import type { Period } from "./report";

export type MonthTarget = { month: string; amount: number }; // month = YYYY-MM-01

/** 기간에 걸친 월 목표 합 (기간 시작 월 ~ 끝 월). 목표를 하나도 안 넣었으면 null */
export function targetFor(targets: MonthTarget[], p: Period): number | null {
  const from = p.from.slice(0, 7);
  const to = p.to.slice(0, 7);
  const inP = targets.filter((t) => t.month.slice(0, 7) >= from && t.month.slice(0, 7) <= to);
  return inP.length ? inP.reduce((s, t) => s + Number(t.amount), 0) : null;
}

/** 달성률(%) — 목표가 없거나 0 이면 null */
export function attainment(actual: number, target: number | null): number | null {
  if (target == null || target <= 0) return null;
  return Math.round((actual / target) * 1000) / 10;
}

/** 진행률 기대치(%) — 기간이 얼마나 지났는지 (달성률이 이보다 낮으면 뒤처짐) */
export function elapsedPct(p: Period, today: string, periodEnd: string): number {
  const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const total = (day(periodEnd) - day(p.from)) / 86_400_000 + 1;
  const done = (day(today) - day(p.from)) / 86_400_000 + 1;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/** 목표 입력값(문자열, 원·억·만 허용은 화면에서 parseWon) → 저장 행 검증 */
export function validMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(month);
}

const WON_STAGES = new Set(["won", "fulfillment", "billing"]);

export type Coverage = { remaining: number; open: number; weighted: number; ratio: number | null; weightedRatio: number | null };

/**
 * 파이프라인 커버리지 — 남은 목표 대비 아직 수주 전(진행 중) 사업 규모. 보통 3배 이상이면 여유 있다고 본다.
 * 가중 = 규모 × 단계 확률(부문 파이프라인 설정). 남은 목표가 없으면 비율은 null
 */
export function coverage(
  deals: { stage: string; status: string; amount: number | null }[],
  probabilities: Record<string, number>,
  target: number | null,
  achieved: number,
): Coverage | null {
  if (target == null || target <= 0) return null;
  const open = deals.filter((d) => d.status === "active" && !WON_STAGES.has(d.stage) && d.amount != null);
  const sum = open.reduce((s, d) => s + Number(d.amount), 0);
  const weighted = Math.round(open.reduce((s, d) => s + (Number(d.amount) * (probabilities[d.stage] ?? 0)) / 100, 0));
  const remaining = Math.max(0, target - achieved);
  const r = (n: number) => (remaining > 0 ? Math.round((n / remaining) * 10) / 10 : null);
  return { remaining, open: sum, weighted, ratio: r(sum), weightedRatio: r(weighted) };
}
