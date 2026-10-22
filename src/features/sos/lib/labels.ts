import type { Stage } from "../types";

// 화면·요약에 쓰는 단계 이름
export const STAGE_LABEL: Record<Stage, string> = {
  plan: "발주계획",
  prespec: "사전규격",
  bid: "입찰공고",
  award: "낙찰",
  contract: "계약",
};
