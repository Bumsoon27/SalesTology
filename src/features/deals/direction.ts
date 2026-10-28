// AI 디렉션 — 사업마다 '다음에 할 일'을 우선순위로 제안한다. 순수 함수 (테스트: direction.test.ts)
//
// 참고: Salesforce Einstein Next Best Action, Clari 딜 위험 신호(정체·기한 밀림), Pipedrive rotting.
// 규칙 기반이라 사업 데이터가 외부(LLM)로 나가지 않고, 왜 그 제안이 나왔는지(why)를 항상 함께 보여준다.
// 나중에 sLLM 을 붙이더라도 이 결과(구조화된 신호)를 입력으로 쓰고, 이 함수는 그대로 기본값으로 남긴다.
import { STALE_AFTER_DAYS } from "./pipeline";
import { needsRenewal } from "./renewal";
import { computeTaskState, daysUntil, seoulDay } from "./status";
import { TASK_LABEL, type DealRow, type DealStage, type TaskRow } from "./types";

export type DirectionKind = "issue" | "overdue" | "due_soon" | "missing_schedule" | "stale" | "single_thread" | "competitor" | "renewal" | "data" | "margin" | "stage";

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
/** 단일 접점 경고 대상: 이 규모(원) 이상의 수주 전 사업 */
export const SINGLE_THREAD_MIN_AMOUNT = 100_000_000;
/** 단일 접점 판단에 보는 최근 활동 기록 기간(일) */
export const SINGLE_THREAD_WINDOW_DAYS = 90;
const DUE_SOON_DAYS = 3;

const WON_OR_LATER = new Set<DealStage>(["won", "fulfillment", "billing"]);
const PRE_WIN = new Set<DealStage>(["discovery", "quoting", "proposal", "negotiation", "bidding"]);
const COMPETITOR_STAGES = new Set<DealStage>(["proposal", "negotiation", "bidding"]);

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

type Deal = Pick<DealRow, "stage" | "status" | "amount" | "last_activity_at" | "deal_tasks" | "issues"> & {
  gp?: number | null;
  deal_notes?: { occurred_on: string; counterpart: string | null }[];
  period_end?: string | null;
  /** 이 사업의 갱신 사업(renewal:<id>)이 이미 있는지 */
  renewal_exists?: boolean;
  contract_type?: "competitive" | "negotiated";
  /** 기록된 경쟁사 (없으면 모름 → 신호 안 냄) */
  deal_competitors?: { id: string }[];
};

/** 최근 활동 기록의 고객 쪽 상대 (이름 비교는 공백·대소문자 무시) */
export function recentCounterparts(notes: { occurred_on: string; counterpart: string | null }[], today: string, windowDays = SINGLE_THREAD_WINDOW_DAYS) {
  const recent = notes.filter((n) => {
    const age = daysUntil(today, n.occurred_on.slice(0, 10));
    return age >= 0 && age <= windowDays;
  });
  const names = new Map<string, string>();
  for (const n of recent) {
    const name = n.counterpart?.trim();
    if (name) names.set(name.replace(/\s+/g, "").toLowerCase(), name);
  }
  return { noteCount: recent.length, names: [...names.values()] };
}

const taskName = (t: TaskRow) => (t.type === "custom" ? (t.title ?? "업무") : TASK_LABEL[t.type]);

export function suggestDirections(deal: Deal, today: string, limit = 3, staleAfterDays = STALE_AFTER_DAYS): Direction[] {
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
    const idle = daysUntil(today, seoulDay(deal.last_activity_at));
    if (idle >= staleAfterDays) {
      out.push({ kind: "stale", priority: Math.min(80, 50 + idle), title: "고객 접촉 — 근황 확인", why: `${idle}일째 활동이 없습니다 (${staleAfterDays}일 기준)` });
    }
  }

  // 5) 단일 접점 (Clari single-threading) — 큰 수주 전 사업인데 최근 활동이 고객 쪽 한 사람하고만 있었다
  const amount = deal.amount == null ? null : Number(deal.amount);
  if (PRE_WIN.has(deal.stage) && amount != null && amount >= SINGLE_THREAD_MIN_AMOUNT && deal.deal_notes) {
    const { noteCount, names } = recentCounterparts(deal.deal_notes, today);
    // 최근 기록이 아예 없으면 '정체'가 다룬다
    if (noteCount > 0 && names.length <= 1) {
      out.push({
        kind: "single_thread",
        priority: 52,
        title: names.length === 1 ? `다른 담당자도 만나기 — 지금은 ${names[0]} 한 명` : "활동 기록에 '누구와'(고객 쪽 상대) 남기기",
        why:
          names.length === 1
            ? `규모 1억 이상 사업의 최근 ${SINGLE_THREAD_WINDOW_DAYS}일 접점이 한 사람뿐입니다. 의사결정자·실무자를 더 확보하세요`
            : "상대를 남겨야 접점이 한 사람에 몰렸는지 알 수 있습니다",
      });
    }
  }

  // 5-1) 경쟁입찰인데 제안 이후까지 경쟁사 기록이 없다 — 경쟁사별 전적·가격 전략에 필요
  if (deal.contract_type === "competitive" && COMPETITOR_STAGES.has(deal.stage) && deal.deal_competitors && deal.deal_competitors.length === 0) {
    out.push({ kind: "competitor", priority: 42, title: "맞붙는 경쟁사 기록하기", why: "경쟁입찰 사업입니다 — 경쟁사·예상 제안가를 남기면 가격 전략과 경쟁사별 전적에 쓰입니다" });
  }

  // 6) 데이터 빈칸 / 마진
  const gp = deal.gp == null ? null : Number(deal.gp);
  if (amount == null) out.push({ kind: "data", priority: 45, title: "사업 규모 입력", why: "규모가 없으면 파이프라인 예측에서 빠집니다" });
  else if (gp == null) out.push({ kind: "data", priority: 40, title: "GP 입력", why: "GP 가 없으면 GP율을 계산할 수 없습니다" });
  else if (amount > 0) {
    const rate = (gp / amount) * 100;
    if (rate < LOW_MARGIN_RATE) {
      out.push({ kind: "margin", priority: 55, title: "매입 단가·조건 재검토", why: `GP율 ${Math.round(rate * 10) / 10}% — ${LOW_MARGIN_RATE}% 미만입니다` });
    }
  }

  // 갱신 — 계약 종료가 다가오는데 갱신 사업이 없다 (유지보수·재계약 매출)
  const renewLeft = needsRenewal(deal, today, !!deal.renewal_exists);
  if (renewLeft != null) {
    out.push({
      kind: "renewal",
      priority: renewLeft < 30 ? 66 : 50,
      title: `갱신 사업 만들기 — 계약 종료 ${renewLeft < 0 ? `${-renewLeft}일 지남` : renewLeft === 0 ? "오늘" : `D-${renewLeft}`}`,
      why: "같은 고객·조건으로 다음 계약 기간 사업을 미리 만들어 두면 재계약을 놓치지 않습니다",
    });
  }

  // 7) 급한 일이 없으면 단계별 기본 다음 할 일
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
  staleAfterDays = STALE_AFTER_DAYS,
): DealDirection[] {
  const withDeal = (d: (typeof deals)[number], x: Direction): DealDirection => ({ ...x, dealId: d.id, dealName: d.name, customer: d.customer.name });
  const urgent: DealDirection[] = [];
  const plays: { amount: number; item: DealDirection }[] = [];

  for (const d of deals) {
    const items = suggestDirections(d, today, 5, staleAfterDays);
    const signals = items.filter((x) => x.kind !== "stage");
    urgent.push(...signals.map((x) => withDeal(d, x)));
    const play = items.find((x) => x.kind === "stage");
    if (signals.length === 0 && play) plays.push({ amount: Number(d.amount ?? 0), item: withDeal(d, play) });
  }

  urgent.sort((a, b) => b.priority - a.priority);
  plays.sort((a, b) => b.amount - a.amount);
  return [...urgent, ...plays.map((p) => p.item)].slice(0, limit);
}
