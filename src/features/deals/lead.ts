// B(SOS) 리드 → A 사업 전환 시 입력값을 create_deal() 인자로 바꾼다. 순수 함수.
import type { DealStage } from "./types";

export type LeadToDealInput = {
  /** 사업명 */
  name: string;
  /** 고객사(기관)명. companies 에 없으면 create_deal 이 만든다 */
  customer: string;
  /** 사업 규모 = 예산 (원, 부가세 별도). "1.5억" 같은 문자열은 받지 않는다 — 숫자 또는 "150,000,000" */
  budget?: number | string | null;
  /** 발주 시기 → 예상 계약월. "YYYY-MM" 또는 "YYYY-MM-DD" */
  orderMonth?: string | null;
  /** 조달 방식: 입찰이면 경쟁입찰, 그 외 수의계약 */
  procurement: "bid" | "negotiated";
  /** 물품 요약 (선택) */
  items?: string | null;
  /** 시작 단계 (기본: 발굴) */
  stage?: DealStage;
  /** SI·매입처 이름 (선택) */
  si?: string[];
  suppliers?: string[];
  /** 기존 고객사 id (findOrCreateCompany 결과). 주면 customer 이름 대신 이 회사를 쓴다 */
  customerId?: string | null;
  /** 담당 영업대표 (같은 부문의 활성 사용자). 없으면 호출한 사용자 */
  ownerId?: string | null;
  /** 출처 참조 = 멱등 키. 예: "sos_lead:<리드 id>". 같은 값으로 다시 부르면 새로 만들지 않고 기존 사업 id 를 돌려준다 */
  sourceRef?: string | null;
};

export type CreateDealArgs = {
  p_name: string;
  p_customer: string;
  p_contract_type: "competitive" | "negotiated";
  p_stage: DealStage;
  p_amount: number | null;
  p_expected_contract_month: string | null;
  p_items: string | null;
  p_si: string[];
  p_suppliers: string[];
  p_customer_id: string | null;
  p_owner_id: string | null;
  p_source_ref: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toCreateDealArgs(input: LeadToDealInput): { ok: true; args: CreateDealArgs } | { ok: false; error: string } {
  const name = input.name?.trim();
  const customer = input.customer?.trim();
  if (!name) return { ok: false, error: "사업명이 비어 있습니다." };
  if (!customer && !input.customerId?.trim()) return { ok: false, error: "고객사명 또는 고객사 id 가 필요합니다." };

  let amount: number | null = null;
  if (input.budget != null && input.budget !== "") {
    const n = typeof input.budget === "number" ? input.budget : Number(String(input.budget).replace(/[,\s원]/g, ""));
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `예산 형식이 올바르지 않습니다: ${input.budget}` };
    amount = Math.round(n);
  }

  let month: string | null = null;
  if (input.orderMonth) {
    const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(input.orderMonth.trim());
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return { ok: false, error: `발주 시기 형식이 올바르지 않습니다: ${input.orderMonth}` };
    month = `${m[1]}-${m[2]}-01`;
  }

  const contractType = input.procurement === "bid" ? "competitive" : "negotiated";
  const stage = input.stage ?? "discovery";
  // 입찰 단계는 경쟁입찰에서만 쓸 수 있다 (DB 제약과 같은 규칙)
  if (stage === "bidding" && contractType !== "competitive") return { ok: false, error: "수의계약 사업은 '입찰' 단계를 쓸 수 없습니다." };

  const customerId = input.customerId?.trim() || null;
  const ownerId = input.ownerId?.trim() || null;
  if (customerId && !UUID.test(customerId)) return { ok: false, error: `고객사 id 형식이 올바르지 않습니다: ${customerId}` };
  if (ownerId && !UUID.test(ownerId)) return { ok: false, error: `담당자 id 형식이 올바르지 않습니다: ${ownerId}` };
  const sourceRef = input.sourceRef?.trim() || null;
  if (sourceRef && sourceRef.length > 200) return { ok: false, error: "출처 참조는 200자 이하여야 합니다." };

  return {
    ok: true,
    args: {
      p_name: name,
      p_customer: customer ?? "",
      p_contract_type: contractType,
      p_stage: stage,
      p_amount: amount,
      p_expected_contract_month: month,
      p_items: input.items?.trim() || null,
      p_si: (input.si ?? []).map((s) => s.trim()).filter(Boolean),
      p_suppliers: (input.suppliers ?? []).map((s) => s.trim()).filter(Boolean),
      p_customer_id: customerId,
      p_owner_id: ownerId,
      p_source_ref: sourceRef,
    },
  };
}
