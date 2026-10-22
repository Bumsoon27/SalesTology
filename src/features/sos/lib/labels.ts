import type { DeadlineType, LeadStatus, Stage } from "../types";

// 화면·요약에 쓰는 단계 이름
export const STAGE_LABEL: Record<Stage, string> = {
  plan: "발주계획",
  prespec: "사전규격",
  bid: "입찰공고",
  award: "낙찰",
  contract: "계약",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "새 리드",
  reviewing: "검토 중",
  on_hold: "보류",
  dismissed: "관심 없음",
  converted: "사업 전환됨",
};

export const DEADLINE_LABEL: Record<DeadlineType, string> = {
  prespec_opinion: "의견 마감",
  bid_close: "입찰 마감",
};
