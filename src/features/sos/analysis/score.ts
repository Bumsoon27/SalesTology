import { daysUntil, quarterOf } from "../lib/date";
import type { Keyword } from "../types";
import type { LeadDraft } from "./chain";

// 점수 가중치. 조정은 이 상수만 바꾼다 (설계서 §3.3-3).
export const W = {
  core: 3,
  extended: 1,
  fitCap: 9,
  deadline7: 3,
  deadline14: 2,
  quarterNear: 2,
  earlyStage: 2,
  budget1e8: 1,
  budget5e8: 2,
  perOrgSignal: 2,
  corroborationCap: 4,
};

// 항목별 최대치 합 — 이 값이 100점 기준
export const MAX = W.fitCap + W.deadline7 + W.quarterNear + W.earlyStage + W.budget5e8 + W.corroborationCap; // 22

export type ScoreParts = {
  fit: number;
  timing: number;
  stage: number;
  budget: number;
  corroboration: number;
};

export type ScoreInput = {
  draft: LeadDraft;
  matched: Keyword[];
  orgSignals90d: number;
  today: string; // YYYY-MM-DD (서울 기준)
};

function fitPart(matched: Keyword[]): number {
  const raw = matched
    .filter((k) => k.tier !== "exclude")
    .reduce((sum, k) => sum + (k.weight ?? (k.tier === "core" ? W.core : W.extended)), 0);
  return Math.min(raw, W.fitCap);
}

function deadlinePart(nextDeadlineAt: string | null, today: string): number {
  if (!nextDeadlineAt) return 0;
  const d = daysUntil(nextDeadlineAt, today);
  if (d >= 0 && d <= 7) return W.deadline7;
  if (d >= 8 && d <= 14) return W.deadline14;
  return 0;
}

// 발주월의 분기가 오늘의 이번 분기 또는 다음 분기면 가점. Q4 의 다음 분기는 다음 해 Q1.
function quarterPart(orderMonth: string | null, today: string): number {
  if (!orderMonth) return 0;
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const thisQ = Math.ceil(m / 3);
  const nextQ = thisQ === 4 ? `${y + 1}-Q1` : `${y}-Q${thisQ + 1}`;
  const target = quarterOf(orderMonth);
  return target === quarterOf(today.slice(0, 7)) || target === nextQ ? W.quarterNear : 0;
}

function stagePart(stage: LeadDraft["stage"]): number {
  return stage === "plan" || stage === "prespec" ? W.earlyStage : 0;
}

function budgetPart(budget: number | null): number {
  if (budget == null) return 0;
  if (budget >= 500_000_000) return W.budget5e8;
  if (budget >= 100_000_000) return W.budget1e8;
  return 0;
}

/** 리드 점수 0~100. 누락된 값은 0점으로 처리한다. */
export function scoreLead(input: ScoreInput): { score: number; parts: ScoreParts } {
  const { draft, matched, orgSignals90d, today } = input;
  const parts: ScoreParts = {
    fit: fitPart(matched),
    timing: deadlinePart(draft.nextDeadlineAt, today) + quarterPart(draft.orderMonth, today),
    stage: stagePart(draft.stage),
    budget: budgetPart(draft.budget),
    corroboration: Math.min(orgSignals90d * W.perOrgSignal, W.corroborationCap),
  };
  const raw = parts.fit + parts.timing + parts.stage + parts.budget + parts.corroboration;
  return { score: Math.round((raw / MAX) * 100), parts };
}
