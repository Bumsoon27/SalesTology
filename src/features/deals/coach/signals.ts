// AI 코칭 입력 — 사업 상세를 '익명 신호'로 바꾼다. 순수 함수 (테스트: signals.test.ts)
//
// 보안 원칙 (docs/research/2026-10-23-benchmark.md 'sLLM 붙이는 방법')
// - 보내지 않는 것: 사업명·고객사·관계사 이름, 사람 이름(담당자·상대), 메모·이슈 본문, 정확한 금액, 날짜
// - 보내는 것: 단계·계약 방식·금액 구간·GP율 구간·경과 일수·업무 상태·활동 종류별 횟수·신호 종류
import { recentCounterparts, suggestDirections, type DirectionKind } from "../direction";
import { computeTaskState, daysUntil, seoulDay } from "../status";
import { STAGE_LABEL, TASK_LABEL, type DealRow, type DealStage, type IssueRow, type TaskRow } from "../types";
import { NOTE_LABEL, type NoteKind } from "../notes";

export type CoachInput = {
  stage: DealStage;
  status: DealRow["status"];
  contractType: "competitive" | "negotiated";
  amount: number | null;
  gp: number | null;
  lastActivityAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  tasks: TaskRow[];
  issues: IssueRow[];
  parties: { role: "si" | "supplier" }[];
  notes: { kind: NoteKind; occurredOn: string; counterpart: string | null }[];
  staleAfterDays: number;
};

export type CoachSignals = {
  단계: string;
  상태: string;
  계약방식: string;
  규모구간: string;
  GP율구간: string;
  마지막활동_며칠전: number;
  계약기간_개월: number | null;
  열린이슈_건수: number;
  업무: string[];
  관계사: string;
  최근90일_활동: Record<string, number>;
  최근90일_고객측상대_수: number;
  감지된신호: string[];
};

const STATUS_KO: Record<DealRow["status"], string> = { active: "진행", on_hold: "보류", lost: "실주", closed: "종결" };

/** 신호 종류 → 사람 이름이 들어가지 않는 일반 설명 (direction 의 title 에는 이름이 들어갈 수 있어 쓰지 않는다) */
const SIGNAL_KO: Record<DirectionKind, string> = {
  issue: "열린 이슈 있음",
  overdue: "기한 지난 업무 있음",
  due_soon: "3일 안에 기한인 업무 있음",
  missing_schedule: "수주 후 필수 일정(배송·계산서) 미등록",
  stale: "활동 정체",
  single_thread: "고객 접점이 한 사람에 몰림",
  data: "규모·GP 정보 빈칸",
  margin: "GP율 낮음",
  stage: "단계별 기본 할 일",
};

export function amountBand(n: number | null): string {
  if (n == null) return "미입력";
  if (n < 30_000_000) return "3천만 미만";
  if (n < 100_000_000) return "3천만~1억";
  if (n < 500_000_000) return "1억~5억";
  if (n < 1_000_000_000) return "5억~10억";
  return "10억 이상";
}

export function gpRateBand(amount: number | null, gp: number | null): string {
  if (amount == null || gp == null || amount <= 0) return "미입력";
  const r = (gp / amount) * 100;
  if (r < 0) return "손실";
  if (r < 5) return "5% 미만";
  if (r < 10) return "5~10%";
  if (r < 20) return "10~20%";
  if (r < 40) return "20~40%";
  return "40% 이상";
}

function taskLine(t: TaskRow, today: string): string {
  const name = t.type === "custom" ? "기타 업무" : TASK_LABEL[t.type]; // 사용자 입력 제목은 보내지 않는다
  const st = computeTaskState(t);
  if (st === "done") return `${name}: 완료`;
  if (st === "excluded") return `${name}: 제외`;
  if (!t.due_date) return `${name}: 일정 미정`;
  const d = daysUntil(t.due_date, today);
  return `${name}: ${d < 0 ? `기한 ${-d}일 지남` : d === 0 ? "오늘 기한" : `${d}일 남음`}`;
}

export function buildCoachSignals(input: CoachInput, today: string): CoachSignals {
  const notes90 = input.notes.filter((n) => {
    const age = daysUntil(today, n.occurredOn.slice(0, 10));
    return age >= 0 && age <= 90;
  });
  const byKind: Record<string, number> = {};
  for (const n of notes90) byKind[NOTE_LABEL[n.kind]] = (byKind[NOTE_LABEL[n.kind]] ?? 0) + 1;

  const months =
    input.periodStart && input.periodEnd
      ? Math.max(0, Math.round(daysUntil(input.periodEnd, input.periodStart) / 30))
      : null;

  const directions = suggestDirections(
    {
      stage: input.stage,
      status: input.status,
      amount: input.amount,
      gp: input.gp,
      last_activity_at: input.lastActivityAt,
      deal_tasks: input.tasks,
      issues: input.issues,
      deal_notes: input.notes.map((n) => ({ occurred_on: n.occurredOn, counterpart: n.counterpart })),
    },
    today,
    8,
    input.staleAfterDays,
  );

  const si = input.parties.filter((p) => p.role === "si").length;
  const sup = input.parties.filter((p) => p.role === "supplier").length;

  return {
    단계: STAGE_LABEL[input.stage],
    상태: STATUS_KO[input.status],
    계약방식: input.contractType === "competitive" ? "경쟁입찰" : "수의계약",
    규모구간: amountBand(input.amount),
    GP율구간: gpRateBand(input.amount, input.gp),
    마지막활동_며칠전: Math.max(0, daysUntil(today, seoulDay(input.lastActivityAt))),
    계약기간_개월: months,
    열린이슈_건수: input.issues.filter((i) => i.status === "open").length,
    업무: input.tasks.map((t) => taskLine(t, today)),
    관계사: si + sup === 0 ? "없음(직접 진행)" : `매출처(SI) ${si}곳, 매입처 ${sup}곳`,
    최근90일_활동: byKind,
    최근90일_고객측상대_수: recentCounterparts(input.notes.map((n) => ({ occurred_on: n.occurredOn, counterpart: n.counterpart })), today).names.length,
    감지된신호: [...new Set(directions.map((d) => SIGNAL_KO[d.kind]))],
  };
}

/** 같은 신호면 같은 값 — 캐시 키. 중첩 객체까지 키 순서를 고정한 JSON */
export function signalsKey(s: CoachSignals): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(stable(s));
}
