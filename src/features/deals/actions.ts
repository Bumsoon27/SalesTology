"use server";

import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";
import { MONEY_HINT } from "./edit";
import { checkGp, parseWon } from "./money";

export type CreateDealState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const date = (v: FormDataEntryValue | null) => (String(v ?? "") ? String(v) : null);

// 영업기회 등록 (설계서 §6.6). 검증은 여기와 DB(체크 제약·RLS) 양쪽에서 한다.
export async function createDeal(_prev: CreateDealState, formData: FormData): Promise<CreateDealState> {
  const name = text(formData.get("name"));
  const customer = text(formData.get("customer"));
  const contractType = String(formData.get("contractType") ?? "");
  const amount = parseWon(String(formData.get("amount") ?? ""));
  const gp = parseWon(String(formData.get("gp") ?? ""), { allowNegative: true });
  const periodStart = date(formData.get("periodStart"));
  const periodEnd = date(formData.get("periodEnd"));

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "사업명을 입력하세요.";
  if (!customer) fieldErrors.customer = "고객사를 입력하세요.";
  if (contractType !== "competitive" && contractType !== "negotiated") fieldErrors.contractType = "계약 방식을 고르세요.";
  // 사업 규모·GP 는 필수 (SB 요청: 파이프라인 예측·GP율이 빈 값 없이 나오게)
  if (!amount.ok) fieldErrors.amount = MONEY_HINT;
  else if (amount.value == null) fieldErrors.amount = "사업 규모를 입력하세요.";
  if (!gp.ok) fieldErrors.gp = MONEY_HINT;
  else if (gp.value == null) fieldErrors.gp = "GP를 입력하세요. (모르면 0)";
  if (amount.ok && gp.ok) {
    const gpError = checkGp(amount.value, gp.value);
    if (gpError && !fieldErrors.gp) fieldErrors.gp = gpError;
  }
  if (periodStart && periodEnd && periodEnd < periodStart) fieldErrors.periodEnd = "종료일은 시작일 이후여야 합니다.";
  if (Object.keys(fieldErrors).length || !amount.ok || !gp.ok) return { ok: false, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_deal", {
    p_name: name,
    p_customer: customer,
    p_contract_type: contractType,
    p_stage: String(formData.get("stage") || "discovery"),
    p_amount: amount.value,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_items: text(formData.get("items")),
    p_si: list(formData.get("si")),
    p_suppliers: list(formData.get("suppliers")),
    p_delivery_date: date(formData.get("deliveryDate")),
    p_invoice_date: date(formData.get("invoiceDate")),
    p_gp: gp.value,
  });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}
