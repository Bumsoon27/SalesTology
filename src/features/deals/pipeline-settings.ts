// 부문별 파이프라인 설정 (단계 확률·정체 기준일) — 순수 함수 (테스트: pipeline-settings.test.ts)
import type { DealStage } from "./types";

export const STAGES: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won", "fulfillment", "billing"];

export type PipelineSettings = { probabilities: Record<DealStage, number>; staleAfterDays: number; aiCoachEnabled: boolean };

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  probabilities: { discovery: 10, quoting: 20, proposal: 40, negotiation: 60, bidding: 50, won: 100, fulfillment: 100, billing: 100 },
  staleAfterDays: 14,
  aiCoachEnabled: true,
};

const isPercent = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100;

/** DB 행 → 설정. 행이 없거나 값이 이상하면 그 칸만 기본값 */
export function fromSettingsRow(
  row: { stage_probabilities: unknown; stale_after_days: number; ai_coach_enabled?: boolean | null } | null,
): PipelineSettings {
  if (!row) return DEFAULT_PIPELINE_SETTINGS;
  const raw = (row.stage_probabilities && typeof row.stage_probabilities === "object" ? row.stage_probabilities : {}) as Record<string, unknown>;
  const probabilities = { ...DEFAULT_PIPELINE_SETTINGS.probabilities };
  for (const s of STAGES) if (isPercent(raw[s])) probabilities[s] = raw[s];
  const days = Number.isInteger(row.stale_after_days) && row.stale_after_days >= 3 && row.stale_after_days <= 90 ? row.stale_after_days : 14;
  return { probabilities, staleAfterDays: days, aiCoachEnabled: row.ai_coach_enabled !== false };
}

/** 관리자 화면 입력(문자열) → 저장할 값. 칸마다 0~100 정수, 정체 기준 3~90일 */
export function parseSettingsInput(
  input: { probabilities: Record<string, string>; staleAfterDays: string; aiCoachEnabled?: boolean },
):
  | { ok: true; value: { stage_probabilities: Record<DealStage, number>; stale_after_days: number; ai_coach_enabled: boolean } }
  | { ok: false; error: string } {
  const out = {} as Record<DealStage, number>;
  for (const s of STAGES) {
    const raw = (input.probabilities[s] ?? "").trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < 0 || n > 100) return { ok: false, error: `확률은 0~100 사이 정수로 입력하세요 (${s}).` };
    out[s] = n;
  }
  const days = Number(input.staleAfterDays.trim());
  if (!Number.isInteger(days) || days < 3 || days > 90) return { ok: false, error: "정체 기준은 3~90일 사이로 입력하세요." };
  return { ok: true, value: { stage_probabilities: out, stale_after_days: days, ai_coach_enabled: input.aiCoachEnabled !== false } };
}
