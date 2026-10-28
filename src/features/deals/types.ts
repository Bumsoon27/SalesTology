// DB 행 타입 (supabase/migrations/20261020150000_a_deals.sql 과 맞춘다)
export type DealStage = "discovery" | "quoting" | "proposal" | "negotiation" | "bidding" | "won" | "fulfillment" | "billing";
export type DealStatus = "active" | "on_hold" | "lost" | "closed";
export type TaskType =
  | "contract" | "quote_reply_out" | "quote_reply_in" | "order" | "delivery"
  | "inspection" | "invoice_out" | "invoice_in" | "custom";

export type TaskRow = {
  id: string;
  type: TaskType;
  title: string | null;
  company_id: string | null;
  due_date: string | null; // YYYY-MM-DD
  done_at: string | null;
  excluded_reason: string | null;
};

export type IssueRow = { id: string; title: string; status: "open" | "resolved" };

export type PartyRow = {
  id: string;
  role: "si" | "supplier";
  via_party_id: string | null;
  company: { id: string; name: string };
};

export type DealRow = {
  id: string;
  name: string;
  stage: DealStage;
  status: DealStatus;
  amount: number | null;
  gp?: number | null;
  last_activity_at: string;
  /** 동시 수정 감지 (파이프라인 보드에서 단계 변경) */
  updated_at?: string;
  contract_type?: "competitive" | "negotiated";
  period_start?: string | null;
  period_end?: string | null;
  source_ref?: string | null;
  customer: { id: string; name: string };
  deal_parties: PartyRow[];
  deal_tasks: TaskRow[];
  issues: IssueRow[];
  /** 활동 기록 요약 (관계 강도·단일 접점) */
  deal_notes?: { kind: "call" | "meeting" | "email" | "note"; occurred_on: string; counterpart: string | null }[];
};

/** B(SOS) 리드에서 전환된 사업인지 — createDealFromLead 의 sourceRef 규칙 "sos_lead:<id>" */
export const isFromSos = (sourceRef: string | null | undefined) => !!sourceRef?.startsWith("sos_lead:");

export const STAGE_LABEL: Record<DealStage, string> = {
  discovery: "발굴",
  quoting: "견적",
  proposal: "제안",
  negotiation: "협상",
  bidding: "입찰",
  won: "수주",
  fulfillment: "이행",
  billing: "빌링",
};

export const TASK_LABEL: Record<TaskType, string> = {
  contract: "계약",
  quote_reply_out: "견적 회신",
  quote_reply_in: "견적 회신 대기",
  order: "발주",
  delivery: "배송",
  inspection: "검수",
  invoice_out: "계산서",
  invoice_in: "매입 계산서",
  custom: "기타",
};
