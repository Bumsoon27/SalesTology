// 파이프라인 요약 — 진행 중 사업의 규모·가중 예상·GP·정체 사업. 순수 함수 (테스트: pipeline.test.ts)
//
// 참고한 사례
// - 가중 파이프라인(Pipedrive·Freshworks): 단계마다 성사 확률을 두고 규모 × 확률로 예상 매출을 본다
// - 정체 표시(Pipedrive 'rotting', Clari 'stalled activity'): 마지막 활동 이후 오래 손대지 않은 사업을 따로 띄운다
import { DEFAULT_PIPELINE_SETTINGS, type PipelineSettings } from "./pipeline-settings";
import { daysUntil } from "./status";
import { STAGE_LABEL, type DealRow, type DealStage } from "./types";

/** 단계별 기본 성사 확률 (%). 수주 이후는 확정 매출로 본다. 부문 설정(team_pipeline_settings)이 있으면 그 값 */
export const STAGE_PROBABILITY: Record<DealStage, number> = DEFAULT_PIPELINE_SETTINGS.probabilities;

/** 수주 전 단계에서 이 기간(일) 넘게 활동이 없으면 정체 (기본값, 부문 설정으로 바꿀 수 있다) */
export const STALE_AFTER_DAYS = DEFAULT_PIPELINE_SETTINGS.staleAfterDays;

const PIPELINE_ORDER: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won", "fulfillment", "billing"];
const PRE_WIN = new Set<DealStage>(["discovery", "quoting", "proposal", "negotiation", "bidding"]);

export type PipelineStage = { stage: DealStage; label: string; count: number; amount: number };
export type StaleDeal = { id: string; name: string; customer: string; idleDays: number; stage: DealStage };

export type PipelineSummary = {
  activeCount: number;
  /** 규모 합 (원) — 규모를 넣은 사업만 */
  total: number;
  /** 가중 예상 (원) = Σ 규모 × 단계 확률 */
  weighted: number;
  /** 수주 이후(확정) 규모 */
  committed: number;
  gp: number;
  /** GP율 (%) — GP 를 넣은 사업의 GP ÷ 그 사업들의 규모. 계산할 수 없으면 null */
  gpRate: number | null;
  /** 규모를 안 넣은 진행 중 사업 수 (예측에서 빠짐) */
  missingAmount: number;
  stages: PipelineStage[];
  stale: StaleDeal[];
};

type Deal = Pick<DealRow, "id" | "name" | "stage" | "status" | "amount" | "last_activity_at" | "customer"> & { gp?: number | null };

export function summarizePipeline(deals: Deal[], today: string, settings: PipelineSettings = DEFAULT_PIPELINE_SETTINGS): PipelineSummary {
  const active = deals.filter((d) => d.status === "active");
  const byStage = new Map<DealStage, PipelineStage>(PIPELINE_ORDER.map((s) => [s, { stage: s, label: STAGE_LABEL[s], count: 0, amount: 0 }]));

  let total = 0;
  let weighted = 0;
  let committed = 0;
  let gp = 0;
  let gpBase = 0;
  let missingAmount = 0;
  const stale: StaleDeal[] = [];

  for (const d of active) {
    const amount = d.amount == null ? null : Number(d.amount);
    const row = byStage.get(d.stage);
    if (row) row.count += 1;

    if (amount == null) missingAmount += 1;
    else {
      total += amount;
      weighted += (amount * (settings.probabilities[d.stage] ?? 0)) / 100;
      if (!PRE_WIN.has(d.stage)) committed += amount;
      if (row) row.amount += amount;
      if (d.gp != null) {
        gp += Number(d.gp);
        gpBase += amount;
      }
    }

    if (PRE_WIN.has(d.stage) && d.last_activity_at) {
      const idle = daysUntil(today, d.last_activity_at.slice(0, 10));
      if (idle >= settings.staleAfterDays) stale.push({ id: d.id, name: d.name, customer: d.customer.name, idleDays: idle, stage: d.stage });
    }
  }

  return {
    activeCount: active.length,
    total,
    weighted: Math.round(weighted),
    committed,
    gp,
    gpRate: gpBase > 0 ? Math.round((gp / gpBase) * 1000) / 10 : null,
    missingAmount,
    stages: [...byStage.values()].filter((s) => s.count > 0),
    stale: stale.sort((a, b) => b.idleDays - a.idleDays),
  };
}

export type OwnerPipeline = { ownerId: string; owner: string; count: number; total: number; weighted: number; gp: number; isMe: boolean };

/** 부문 보기의 영업대표별 합계 (Salesforce 팀 예측처럼). 가중 예상이 큰 순 */
export function summarizeByOwner(
  deals: (Deal & { owner_id: string; owner: string })[],
  meId: string,
  settings: PipelineSettings = DEFAULT_PIPELINE_SETTINGS,
): OwnerPipeline[] {
  const by = new Map<string, OwnerPipeline>();
  for (const d of deals) {
    if (d.status !== "active") continue;
    const row = by.get(d.owner_id) ?? { ownerId: d.owner_id, owner: d.owner, count: 0, total: 0, weighted: 0, gp: 0, isMe: d.owner_id === meId };
    row.count += 1;
    if (d.amount != null) {
      const amount = Number(d.amount);
      row.total += amount;
      row.weighted += (amount * (settings.probabilities[d.stage] ?? 0)) / 100;
      if (d.gp != null) row.gp += Number(d.gp);
    }
    by.set(d.owner_id, row);
  }
  return [...by.values()].map((r) => ({ ...r, weighted: Math.round(r.weighted) })).sort((a, b) => b.weighted - a.weighted);
}
