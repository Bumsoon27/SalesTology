// SOS 공통 타입. 시각은 ISO 문자열, orderMonth 는 "YYYY-MM".
export type SourceId = "g2b_plan" | "g2b_prespec" | "g2b_bid";
export type Stage = "plan" | "prespec" | "bid" | "award" | "contract";
export type LeadStatus = "new" | "reviewing" | "on_hold" | "dismissed" | "converted";
export type DeadlineType = "prespec_opinion" | "bid_close";
export type Tier = "core" | "extended" | "exclude";

export type Keyword = {
  id: string;
  term: string;
  tier: Tier;
  weight: number | null;
  active: boolean;
};

export type NormalizedItem = {
  source: SourceId;
  externalId: string;
  version: number;
  title: string;
  orgName: string;
  orgCode: string | null;
  chainPlanNo: string | null;
  chainPrespecNo: string | null;
  chainBidNo: string | null;
  budget: number | null;
  publishedAt: string | null;
  deadlineAt: string | null;
  deadlineType: DeadlineType | null;
  orderMonth: string | null;
  url: string | null;
  matchText: string;
  payload: Record<string, unknown>;
};

// 단계 진행도 — 큰 값이 더 진행된 단계
export const STAGE_RANK: Record<Stage, number> = {
  plan: 0,
  prespec: 1,
  bid: 2,
  award: 3,
  contract: 4,
};
