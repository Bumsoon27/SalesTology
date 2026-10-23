// 리드 → A 사업 전환 입력값 (설계서 §6.1). 순수 함수.
import type { LeadToDealInput } from "@/features/deals/api";
import { displayOrgName } from "./analysis/org";
import type { Stage } from "./types";

export type ConvertibleLead = {
  id: string;
  title: string;
  orgName: string;
  companyId: string | null;
  budget: number | null;
  orderMonth: string | null;
  stage: Stage;
  assigneeId: string | null;
};

/** 멱등 키 — 더블클릭·재시도에도 사업이 하나만 생긴다 */
export const leadSourceRef = (leadId: string) => `sos_lead:${leadId}`;

export function toLeadToDealInput(lead: ConvertibleLead): LeadToDealInput {
  return {
    name: lead.title,
    // A 는 이름이 정확히 같을 때만 같은 회사로 본다 — (주) 등을 떼고 넘긴다
    customer: displayOrgName(lead.orgName),
    customerId: lead.companyId ?? null,
    budget: lead.budget,
    orderMonth: lead.orderMonth,
    // S1 리드는 모두 조달 입찰 흐름
    procurement: "bid",
    // 담당자가 없으면 A 가 누른 사람으로 정한다
    ownerId: lead.assigneeId ?? null,
    sourceRef: leadSourceRef(lead.id),
  };
}

/** DB 의 expected_order_month(date, 1일) → "YYYY-MM". 형식이 다르면 null */
export function orderMonthOf(v: string | null | undefined): string | null {
  const m = v?.match(/^(\d{4}-\d{2})(?:-\d{2})?$/);
  return m ? m[1] : null;
}

/** A 대시보드에서 그 사업이 열리는 주소 (createDealFromLead 의 href 와 같은 형식) */
export const dealHref = (dealId: string) => `/dashboard?focus=d:${dealId}`;
