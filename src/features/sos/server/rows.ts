// sos_ 테이블 행 타입 (생성된 DB 타입이 없어 필요한 칸만 좁게 정의). 타입만 — I/O 없음.
import type { RunCursor } from "../run/steps";
import type { DeadlineType, LeadStatus, SourceId, Stage, Tier } from "../types";

export type RunStatus = "running" | "done" | "partial" | "failed";

export type RunRow = {
  id: string;
  team_id: string;
  mode: "collect" | "reanalyze";
  status: RunStatus;
  range_from: string;
  range_to: string;
  cursor: RunCursor | Record<string, never>;
  stats: Record<string, unknown>;
  started_at: string;
  heartbeat_at: string;
  finished_at: string | null;
};

export type RawItemRow = {
  id: string;
  source: SourceId;
  external_id: string;
  version: number;
  title: string;
  org_name: string | null;
  org_code: string | null;
  org_id: string | null;
  chain_plan_no: string | null;
  chain_prespec_no: string | null;
  chain_bid_no: string | null;
  budget: number | string | null;
  published_at: string | null;
  deadline_at: string | null;
  deadline_type: DeadlineType | null;
  url: string | null;
  match_text: string | null;
  payload?: Record<string, unknown> | null;
  fetched_at: string;
  // 분석 조회는 payload 대신 발주월 값만 꺼낸다 (payload->>orderYear 등)
  order_year?: string | null;
  order_mnth?: string | null;
};

export type LeadRow = {
  id: string;
  team_id: string;
  chain_key: string | null;
  org_id: string | null;
  title: string;
  stage: Stage;
  budget: number | string | null;
  expected_order_month: string | null;
  next_deadline_at: string | null;
  next_deadline_type: DeadlineType | null;
  matched_keyword_ids: string[];
  score: number;
  status: LeadStatus;
  touched_at: string | null;
  hidden: boolean;
  has_new_progress: boolean;
  keyword_mismatch: boolean;
};

export type KeywordRow = {
  id: string;
  term: string;
  tier: Tier;
  weight: number | null;
  active: boolean;
  sources: string[];
};

export type TeamSettings = {
  prespecAlertDays: number;
  aiSummaryTopN: number;
  firstRunDays: number;
};
