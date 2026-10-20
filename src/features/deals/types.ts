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
  last_activity_at: string;
  period_end?: string | null;
  customer: { id: string; name: string };
  deal_parties: PartyRow[];
  deal_tasks: TaskRow[];
  issues: IssueRow[];
};

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
