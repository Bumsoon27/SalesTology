// 관계 강도 — 회사와의 최근 상호작용을 최근성·빈도로 0~100 점수화. 순수 함수 (테스트: relationship.test.ts)
//
// 참고: Affinity relationship strength (최근성·빈도 기반 점수). 우리는 이메일·캘린더 대신
// 앱 안의 기록(활동 기록·업무 완료·사업 활동)을 쓴다. 데이터는 외부로 나가지 않는다.
import { daysUntil, seoulDay } from "./status";
import type { NoteKind } from "./notes";

/** 상호작용 하나의 무게 */
export const INTERACTION_WEIGHT: Record<NoteKind | "task_done" | "deal_touch", number> = {
  meeting: 1.5,
  call: 1.2,
  email: 1,
  note: 0.8,
  task_done: 1,
  deal_touch: 0.5,
};

/** 반감 기준(일): 30일 지나면 무게가 약 1/e 로 줄어든다 */
const DECAY_DAYS = 30;
/** 1년 넘은 기록은 세지 않는다 */
const MAX_AGE_DAYS = 365;

export type Interaction = { on: string; kind: keyof typeof INTERACTION_WEIGHT };

export type Strength = { score: number; tier: "strong" | "medium" | "weak" | "cold"; lastOn: string | null; count: number };

export const TIER_LABEL: Record<Strength["tier"], string> = { strong: "강함", medium: "보통", weak: "약함", cold: "소원" };

/** 점수 → 등급: 강함 70+, 보통 40+, 약함 15+, 소원 */
export const tierOf = (score: number): Strength["tier"] => (score >= 70 ? "strong" : score >= 40 ? "medium" : score >= 15 ? "weak" : "cold");

export function relationshipStrength(events: Interaction[], today: string): Strength {
  let sum = 0;
  let count = 0;
  let lastOn: string | null = null;
  for (const e of events) {
    const on = seoulDay(e.on);
    const age = daysUntil(today, on);
    if (age < 0 || age > MAX_AGE_DAYS) continue;
    sum += INTERACTION_WEIGHT[e.kind] * Math.exp(-age / DECAY_DAYS);
    count += 1;
    if (!lastOn || on > lastOn) lastOn = on;
  }
  // 포화 곡선: 최근 상호작용 2~3건이면 60점대, 많아질수록 100 에 가까워진다
  const score = Math.round(100 * (1 - Math.exp(-sum / 2)));
  return { score, tier: tierOf(score), lastOn, count };
}

type DealLike = {
  last_activity_at: string;
  customer: { id: string };
  deal_parties: { company: { id: string } }[];
  deal_tasks: { done_at: string | null }[];
  deal_notes?: { kind: NoteKind; occurred_on: string }[];
};

/** 사업 목록에서 회사별 관계 강도. 사업의 상호작용은 그 사업의 고객사와 관계사(SI·매입처) 모두에 반영된다 */
export function strengthByCompany(deals: DealLike[], today: string): Map<string, Strength> {
  const events = new Map<string, Interaction[]>();
  for (const d of deals) {
    const dealEvents: Interaction[] = [
      { on: d.last_activity_at, kind: "deal_touch" },
      ...d.deal_tasks.filter((t) => t.done_at).map((t) => ({ on: t.done_at as string, kind: "task_done" as const })),
      ...(d.deal_notes ?? []).map((n) => ({ on: n.occurred_on, kind: n.kind })),
    ];
    for (const companyId of new Set([d.customer.id, ...d.deal_parties.map((p) => p.company.id)])) {
      events.set(companyId, [...(events.get(companyId) ?? []), ...dealEvents]);
    }
  }
  return new Map([...events].map(([id, ev]) => [id, relationshipStrength(ev, today)]));
}
