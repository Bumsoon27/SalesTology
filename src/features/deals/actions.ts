"use server";

import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";

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
  const amountRaw = String(formData.get("amount") ?? "").replace(/[,\s원]/g, "");
  const gpRaw = String(formData.get("gp") ?? "").replace(/[,s원]/g, "");
  const periodStart = date(formData.get("periodStart"));
  const periodEnd = date(formData.get("periodEnd"));

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "사업명을 입력하세요.";
  if (!customer) fieldErrors.customer = "고객사를 입력하세요.";
  if (contractType !== "competitive" && contractType !== "negotiated") fieldErrors.contractType = "계약 방식을 고르세요.";
  if (amountRaw && !/^\d+$/.test(amountRaw)) fieldErrors.amount = "금액은 숫자만 입력하세요.";
  if (gpRaw && !/^-?d+$/.test(gpRaw)) fieldErrors.gp = "GP는 숫자만 입력하세요.";
  if (periodStart && periodEnd && periodEnd < periodStart) fieldErrors.periodEnd = "종료일은 시작일 이후여야 합니다.";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_deal", {
    p_name: name,
    p_customer: customer,
    p_contract_type: contractType,
    p_stage: String(formData.get("stage") || "discovery"),
    p_amount: amountRaw ? Number(amountRaw) : null,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_items: text(formData.get("items")),
    p_si: list(formData.get("si")),
    p_suppliers: list(formData.get("suppliers")),
    p_delivery_date: date(formData.get("deliveryDate")),
    p_invoice_date: date(formData.get("invoiceDate")),
    p_gp: gpRaw ? Number(gpRaw) : null,
  });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}
