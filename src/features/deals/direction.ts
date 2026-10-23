// AI 디렉션 — 사업마다 '다음에 할 일'을 우선순위로 제안한다. 순수 함수 (테스트: direction.test.ts)
//
// 참고: Salesforce Einstein Next Best Action, Clari 딜 위험 신호(정체·기한 밀림), Pipedrive rotting.
// 규칙 기반이라 사업 데이터가 외부(LLM)로 나가지 않고, 왜 그 제안이 나왔는지(why)를 항상 함께 보여준다.
// 나중에 sLLM 을 붙이더라도 이 결과(구조화된 신호)를 입력으로 쓰고, 이 함수는 그대로 기본값으로 남긴다.
import { STALE_AFTER_DAYS } from "./pipeline";
import { computeTaskState, daysUntil } from "./status";
import { TASK_LABEL, type DealRow, type DealStage, type TaskRow } from "./types";

export type DirectionKind = "issue" | "overdue" | "due_soon" | "missing_schedule" | "stale" | "data" | "margin" | "stage";

export type Direction = {
  kind: DirectionKind;
  /** 0~100, 클수록 먼저 */
  priority: number;
  /** 할 일 (명령형, 짧게) */
  title: string;
  /** 왜 — 근거가 된 신호 */
  why: string;
};

/** GP율이 이보다 낮으면 마진 경고 (%) */
export const LOW_MARGIN_RATE = 5;
const DUE_SOON_DAYS = 3;

const WON_OR_LATER = new Set<DealStage>(["won", "fulfillment", "billing"]);
const PRE_WIN = new Set<DealStage>(["discovery", "quoting", "proposal", "negotiation", "bidding"]);

/** 단계별 기본 다음 할 일 (영업 플레이북) */
const STAGE_PLAY: Record<DealStage, { title: string; why: string }> = {
  discovery: { title: "요구사항 확인 미팅 잡기", why: "발굴 단계 — 예산·일정·의사결정자를 확인하면 견적으로 넘어갈 수 있습니다" },
  quoting: { title: "견적서 보내고 회신 일정 등록", why: "견적 단계 — 회신 기한을 업무로 걸어 두면 놓치지 않습니다" },
  proposal: { title: "제안 피드백 받고 경쟁사 확인", why: "제안 단계 — 성사 확률이 오르는 구간입니다" },
  negotiation: { title: "가격·조건 확정하고 계약 일정 등록", why: "협상 단계 — 계약 예정일이 있어야 예측이 정확해집니다" },
  bidding: { title: "입찰 마감·제출 서류 확인", why: "입찰 단계 — 마감일을 업무로 등록해 두세요" },
  won: { title: "계약·발주 업무 등록", why: "수주 — 이행 일정(배송·검수·계산서)을 잡을 차례입니다" },
  fulfillment: { title: "납품·검수 진행 확인", why: "이행 단계 — 검수가 끝나야 계산서를 발행할 수 있습니다" },
  billing: { title: "계산서 발행·수금 확인", why: "빌링 단계 — 수금까지 확인하면 사업을 종결할 수 있습니다" },
};

type Deal = Pick<DealRow, "stage" | "status" | "amount" | "last_activity_at" | "deal_tasks" | "issues"> & { gp?: number | null };

const taskName = (t: TaskRow) => (t.type === "custom" ? (t.title ?? "업무") : TASK_LABEL[t.type]);

export function suggestDirections(deal: Deal, today: string, limit = 3): Direction[] {
  if (deal.status !== "active") return [];
  const out: Direction[] = [];

  // 1) 열린 이슈 — 가장 먼저
  for (const i of deal.issues.filter((x) => x.status === "open")) {
    out.push({ kind: "issue", priority: 100, title: `이슈 해결 계획 정하기: ${i.title}`, why: "열린 이슈가 있으면 사업이 빨간색으로 표시됩니다" });
  }

  // 2) 기한 지남 / 임박
  for (const t of deal.deal_tasks) {
    if (computeTaskState(t) !== "open" || !t.due_date) continue;
    const d = daysUntil(t.due_date, today);
    if (d < 0) {
      out.push({ kind: "overdue", priority: Math.min(95, 85 + -d), title: `${taskName(t)} 처리 — 기한 ${-d}일 지남`, why: "완료했다면 완료 처리, 밀렸다면 새 일정으로 바꾸세요" });
    } else if (d <= DUE_SOON_DAYS) {
      out.push({ kind: "due_soon", priority: 70 - d, title: `${taskName(t)} 준비 — ${d === 0 ? "오늘" : `D-${d}`}`, why: `기한 ${t.due_date}` });
    }
  }

  // 3) 수주 이후 필수 일정 미등록
  if (WON_OR_LATER.has(deal.stage)) {
    for (const type of ["delivery", "invoice_out"] as const) {
      const ofType = deal.deal_tasks.filter((t) => t.type === type);
      if (ofType.length === 0 || ofType.some((t) => computeTaskState(t) === "open" && !t.due_date)) {
        out.push({ kind: "missing_schedule", priority: 60, title: `${TASK_LABEL[type]} 일정 등록`, why: "수주 이후에는 배송·계산서 일정이 있어야 추적됩니다" });
      }
    }
  }

  // 4) 정체 — 수주 전인데 오래 활동이 없음
  if (PRE_WIN.has(deal.stage) && deal.last_activity_at) {
    const idle = daysUntil(today, deal.last_activity_at.slice(0, 10));
    if (idle >= STALE_AFTER_DAYS) {
      out.push({ kind: "stale", priority: Math.min(80, 50 + idle), title: "고객 접촉 — 근황 확인", why: `${idle}일째 활동이 없습니다 (${STALE_AFTER_DAYS}일 기준)` });
    }
  }

  // 5) 데이터 빈칸 / 마진
  const amount = deal.amount == null ? null : Number(deal.amount);
  const gp = deal.gp == null ? null : Number(deal.gp);
  if (amount == null) out.push({ kind: "data", priority: 45, title: "사업 규모 입력", why: "규모가 없으면 파이프라인 예측에서 빠집니다" });
  else if (gp == null) out.push({ kind: "data", priority: 40, title: "GP 입력", why: "GP 가 없으면 GP율을 계산할 수 없습니다" });
  else if (amount > 0) {
    const rate = (gp / amount) * 100;
    if (rate < LOW_MARGIN_RATE) {
      out.push({ kind: "margin", priority: 55, title: "매입 단가·조건 재검토", why: `GP율 ${Math.round(rate * 10) / 10}% — ${LOW_MARGIN_RATE}% 미만입니다` });
    }
  }

  // 6) 급한 일이 없으면 단계별 기본 다음 할 일
  const play = STAGE_PLAY[deal.stage];
  out.push({ kind: "stage", priority: 30, title: play.title, why: play.why });

  return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

export type DealDirection = Direction & { dealId: string; dealName: string; customer: string };

/**
 * 대시보드 '오늘 할 일' — 내 사업 전체에서 급한 것(신호)부터 채우고, 자리가 남으면 사업별 단계 플레이북으로 채운다.
 * 단계 제안은 급한 일이 없는 사업만, 규모가 큰 사업부터 (빈 목록보다 다음 한 걸음을 보여준다)
 */
export function topDirections(
  deals: (Deal & Pick<DealRow, "id" | "name" | "customer">)[],
  today: string,
  limit = 6,
): DealDirection[] {
  const withDeal = (d: (typeof deals)[number], x: Direction): DealDirection => ({ ...x, dealId: d.id, dealName: d.name, customer: d.customer.name });
  const urgent: DealDirection[] = [];
  const plays: { amount: number; item: DealDirection }[] = [];

  for (const d of deals) {
    const items = suggestDirections(d, today, 5);
    const signals = items.filter((x) => x.kind !== "stage");
    urgent.push(...signals.map((x) => withDeal(d, x)));
    const play = items.find((x) => x.kind === "stage");
    if (signals.length === 0 && play) plays.push({ amount: Number(d.amount ?? 0), item: withDeal(d, play) });
  }

  urgent.sort((a, b) => b.priority - a.priority);
  plays.sort((a, b) => b.amount - a.amount);
  return [...urgent, ...plays.map((p) => p.item)].slice(0, limit);
}
