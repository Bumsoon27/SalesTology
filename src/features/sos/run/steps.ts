// 실행(run) 단계 계획 — 순수 함수. 한 단계 = 서버 호출 한 번(60초 안).
// 큰 일은 같은 종류 단계를 커서에 다시 넣어 나눠 처리한다 (continueWith).
import { G2B_OPS, type G2bOp } from "../collectors/g2b";
import { DAY_MS, todayInSeoul } from "../lib/date";

export type RunMode = "collect" | "reanalyze";

export type RunStep =
  | { kind: "purge" }
  | { kind: "fetch"; op: G2bOp; page: number }
  // after: 이어서 볼 사전규격 external_id (keyset)
  | { kind: "link"; after?: string }
  // after: 이어서 훑을 원본 id (keyset). save: 다 훑었으니 리드 저장, offset: 맞은 원본 중 이어서 저장할 위치
  | { kind: "analyze"; after?: string; save?: boolean; offset?: number }
  // aiOffset 이 있으면 템플릿은 끝났고 상위 N건 AI 요약 중
  | { kind: "summarize"; aiOffset?: number }
  | { kind: "finish" };

export type RunCursor = {
  steps: RunStep[];
  index: number;
  totals: Partial<Record<string, number>>;
  // 수집·분석 기준 시각 범위 (ISO). 시작 시 정해 두고 모든 단계가 같은 값을 쓴다
  range?: { from: string; to: string };
  // analyze 훑기 결과 — 부문 키워드에 맞은 원본 id
  matchedIds?: string[];
  // 리드 저장 중 이번 실행에 묶인 chain_key (조각을 나눠 저장해도 마지막에 불일치 판정을 한 번 하려고)
  keptKeys?: string[];
  // 이번 실행에서 요약 사실(단계·제목·키워드·마감)이 바뀐 리드 id — 이 리드만 AI 요약을 다시 쓴다
  factsChangedIds?: string[];
  // AI 요약할 리드 id (템플릿 단계에서 상위 N·하루 상한으로 정해 둔다)
  aiIds?: string[];
  // 다른 요청이 이 단계를 처리 중이면 그 만료 시각 (탭 두 개 동시 진행 방지)
  lease?: string | null;
  // 현재 단계(index)를 몇 번 선점했는지 — 플랫폼 시간 제한으로 죽는 단계의 무한 재시도 방지
  attempts?: { index: number; count: number };
};

const MAX_ATTEMPTS = 3;
// 리드 저장 한 단계에서 다루는 맞은 원본 수 (연결 원본·기존 리드 조회까지 60초 안)
export const SAVE_CHUNK = 300;

const STALE_MS = 15 * 60 * 1000;
const LEASE_MS = 70 * 1000;

export function planRun(mode: RunMode): RunStep[] {
  if (mode === "reanalyze") return [{ kind: "analyze" }, { kind: "summarize" }, { kind: "finish" }];
  return [
    { kind: "purge" },
    ...G2B_OPS.map((op): RunStep => ({ kind: "fetch", op, page: 1 })),
    { kind: "link" },
    { kind: "analyze" },
    { kind: "summarize" },
    { kind: "finish" },
  ];
}

/** stats·totals·sos_fetch_log 에 쓰는 업무 이름 */
export function opLabel(op: G2bOp): string {
  return `${op.source}:${op.biz}`;
}

/** 현재 단계 바로 뒤에 step 을 넣는다 (진행은 하지 않음) */
export function continueWith(cursor: RunCursor, step: RunStep): RunCursor {
  const steps = [...cursor.steps];
  steps.splice(cursor.index + 1, 0, step);
  return { ...cursor, steps };
}

export function advance(cursor: RunCursor): RunCursor {
  return { ...cursor, index: cursor.index + 1 };
}

/** DB jsonb → 커서. 모양이 다르면 null (손상된 실행은 실패 처리) */
export function parseCursor(value: unknown): RunCursor | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<RunCursor>;
  if (!Array.isArray(c.steps) || typeof c.index !== "number" || !Number.isInteger(c.index) || c.index < 0) return null;
  return { ...c, steps: c.steps, index: c.index, totals: c.totals && typeof c.totals === "object" ? c.totals : {} };
}

export function currentStep(cursor: RunCursor): RunStep | null {
  return cursor.steps[cursor.index] ?? null;
}

/** 한 쪽을 받은 뒤: 전체 건수를 기록하고, 다음 쪽이 있으면 바로 뒤에 넣는다 */
export function afterFetch(cursor: RunCursor, op: G2bOp, page: number, totalCount: number, rows: number): RunCursor {
  const next: RunCursor = { ...cursor, totals: { ...cursor.totals, [opLabel(op)]: totalCount } };
  return page * rows < totalCount ? continueWith(next, { kind: "fetch", op, page: page + 1 }) : next;
}

/** heartbeat 가 15분 넘게 그대로면 멈춘 실행 */
export function isStale(heartbeatAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(heartbeatAt) > STALE_MS;
}

/** 단계 선점 1회 기록. 단계가 바뀌었으면 1부터 */
export function recordAttempt(cursor: RunCursor): RunCursor {
  const prev = cursor.attempts;
  const count = prev && prev.index === cursor.index ? prev.count + 1 : 1;
  return { ...cursor, attempts: { index: cursor.index, count } };
}

/** 같은 단계를 3번 시도하고도 끝내지 못했으면 중단 */
export function tooManyAttempts(cursor: RunCursor): boolean {
  return (cursor.attempts?.index === cursor.index ? cursor.attempts.count : 0) > MAX_ATTEMPTS;
}

/**
 * 다른 부문(또는 이전 실행)이 받은 원본을 재사용해도 되는지.
 * 기록의 시작일이 이번 시작일보다 앞서야 한다. 날짜만 비교하면 같은 날 두 번째 실행부터 늘 건너뛰므로, 기록이 덮는 범위 끝(fetched_at = 그 실행의 range.to)이 이번 범위 끝 이후여야 한다.
 */
export function shouldSkipFetch(logs: { range_from: string; fetched_at: string }[], range: { from: Date; to: Date }): boolean {
  const fromDay = todayInSeoul(range.from);
  // 같은 날 시작한 기록은 그날 앞 시각을 덮는지 알 수 없어 다시 받는다 (range_from 은 날짜뿐)
  return logs.some((l) => l.range_from < fromDay && Date.parse(l.fetched_at) >= range.to.getTime());
}

/**
 * sos_fetch_log 한 행의 범위. 나라장터 조회는 range.to(실행 시작)까지만 하므로
 * fetched_at 도 받은 시각이 아니라 range.to — 기록이 실제로 받은 범위만 주장하게 한다.
 */
export function fetchLogRange(range: { from: Date; to: Date }): { range_from: string; range_to: string; fetched_at: string } {
  return { range_from: todayInSeoul(range.from), range_to: todayInSeoul(range.to), fetched_at: range.to.toISOString() };
}

/** 맞은 원본 total 건 중 offset 부터 한 조각. next 가 null 이면 마지막 조각 */
export function planSaveChunk(total: number, offset: number, size = SAVE_CHUNK): { start: number; end: number; next: number | null } {
  const start = Math.min(Math.max(0, offset), total);
  const end = Math.min(start + size, total);
  return { start, end, next: end < total ? end : null };
}

/** 단계가 예외로 끝났을 때: lease 만 풀어 다음 호출이 다시 시도하게 한다 (시도 횟수는 남겨 3번이면 중단) */
export function releaseAfterError(cursor: RunCursor): RunCursor {
  return { ...cursor, lease: null };
}

/** 단계가 정상으로 끝나면 지난 시도의 오류 기록(stepError)을 지운다 */
export function withoutStepError(stats: Record<string, unknown>): Record<string, unknown> {
  if (!("stepError" in stats)) return stats;
  const rest = { ...stats };
  delete rest.stepError;
  return rest;
}

export function withLease(cursor: RunCursor, now: Date): RunCursor {
  return { ...cursor, lease: new Date(now.getTime() + LEASE_MS).toISOString() };
}

export function isBusy(cursor: RunCursor, now: Date): boolean {
  return !!cursor.lease && Date.parse(cursor.lease) > now.getTime();
}

/**
 * 수집 범위: 지난 실행 시작 시각 ~ now. 첫 실행이거나 너무 오래됐으면 최근 firstRunDays 일.
 * 지난 실행의 "시작" 시각을 받는다 — 실행 도중 올라온 공고를 놓치지 않게 (겹침은 upsert 가 흡수).
 */
export function runRange(lastFinishedAt: string | null, now: Date, firstRunDays: number): { from: Date; to: Date } {
  const floor = now.getTime() - firstRunDays * DAY_MS;
  const last = lastFinishedAt ? Date.parse(lastFinishedAt) : NaN;
  const from = Number.isFinite(last) ? Math.max(last, floor) : floor;
  return { from: new Date(from), to: new Date(now.getTime()) };
}

/** 출처 하나라도 오류면 partial */
export function finalStatus(stats: Record<string, unknown>): "done" | "partial" {
  const failed = Object.values(stats).some((v) => !!v && typeof v === "object" && "error" in v);
  return failed ? "partial" : "done";
}

const SOURCE_LABEL: Record<G2bOp["source"], string> = {
  g2b_plan: "발주계획",
  g2b_prespec: "사전규격",
  g2b_bid: "입찰공고",
};
const BIZ_LABEL: Record<G2bOp["biz"], string> = { Thng: "물품", Servc: "용역" };

/** 화면용 업무 이름 — "사전규격(물품)" */
export function opDisplayName(op: G2bOp): string {
  return `${SOURCE_LABEL[op.source]}(${BIZ_LABEL[op.biz]})`;
}

export function stepLabel(step: RunStep | null): string {
  if (!step) return "완료";
  switch (step.kind) {
    case "purge":
      return "보관 정리";
    case "fetch":
      return `${opDisplayName(step.op)} ${step.page}쪽 수집`;
    case "link":
      return "사업 흐름 연결";
    case "analyze":
      return step.save ? "리드 저장" : "키워드 분석";
    case "summarize":
      return step.aiOffset === undefined ? "요약 작성" : "AI 요약";
    case "finish":
      return "마무리";
  }
}
