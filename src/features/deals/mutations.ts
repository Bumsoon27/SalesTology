"use server";

// 상세 패널에서 바로 처리하는 조치 (설계서 §6.5). 권한은 RLS, 동시 수정은 updated_at 비교(§8).
import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";
import type { DealStage, DealStatus, TaskType } from "./types";
import { toDealInfoPatch, type DealInfoInput } from "./edit";

export type MutationResult = { ok: true } | { ok: false; error: string; conflict?: boolean; fieldErrors?: Record<string, string> };

const STAGES: DealStage[] = ["discovery", "quoting", "proposal", "negotiation", "bidding", "won", "fulfillment", "billing"];
const STATUSES: DealStatus[] = ["active", "on_hold", "lost", "closed"];
const TASK_TYPES: TaskType[] = ["contract", "quote_reply_out", "quote_reply_in", "order", "delivery", "inspection", "invoice_out", "invoice_in", "custom"];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function done(error: { message: string } | null, rows?: unknown[] | null): Promise<MutationResult> {
  if (error) return { ok: false, error: error.message };
  if (rows && rows.length === 0) return { ok: false, error: "다른 사람이 먼저 수정했습니다. 새 값을 확인한 뒤 다시 적용해 주세요.", conflict: true };
  refresh();
  return { ok: true };
}

/** 사업 단계·상태 변경. expectedUpdatedAt 이 다르면 덮어쓰지 않는다 */
export async function updateDeal(
  dealId: string,
  patch: { stage?: DealStage; status?: DealStatus },
  expectedUpdatedAt: string,
): Promise<MutationResult> {
  if (patch.stage && !STAGES.includes(patch.stage)) return { ok: false, error: "알 수 없는 단계입니다." };
  if (patch.status && !STATUSES.includes(patch.status)) return { ok: false, error: "알 수 없는 상태입니다." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", dealId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id");
  return done(error, data);
}

/** 핵심 정보(사업명·규모·GP·계약 방식·기간·물품) 수정. 단계는 서버에서 다시 읽어 입찰 규칙을 검사한다 */
export async function updateDealInfo(dealId: string, input: DealInfoInput, expectedUpdatedAt: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: cur, error: readError } = await supabase.from("deals").select("stage").eq("id", dealId).maybeSingle();
  if (readError || !cur) return { ok: false, error: readError?.message ?? "사업을 찾을 수 없습니다." };
  const mapped = toDealInfoPatch(input, cur.stage as DealStage);
  if (!mapped.ok) return { ok: false, error: "입력값을 확인해 주세요.", fieldErrors: mapped.fieldErrors };
  const { data, error } = await supabase
    .from("deals")
    .update(mapped.patch)
    .eq("id", dealId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id");
  return done(error, data);
}

export async function completeTask(taskId: string, doneAt: string): Promise<MutationResult> {
  if (!isDate(doneAt)) return { ok: false, error: "완료일 형식이 올바르지 않습니다." };
  const supabase = await createClient();
  const { error } = await supabase.from("deal_tasks").update({ done_at: doneAt }).eq("id", taskId);
  return done(error);
}

export async function reopenTask(taskId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("deal_tasks").update({ done_at: null, excluded_reason: null }).eq("id", taskId);
  return done(error);
}

export async function rescheduleTask(taskId: string, dueDate: string): Promise<MutationResult> {
  if (!isDate(dueDate)) return { ok: false, error: "날짜 형식이 올바르지 않습니다." };
  const supabase = await createClient();
  const { error } = await supabase.from("deal_tasks").update({ due_date: dueDate }).eq("id", taskId);
  return done(error);
}

/** 확인 버튼만으로 숨길 수 없다 — 사유가 있어야 제외된다 (§3.2) */
export async function excludeTask(taskId: string, reason: string): Promise<MutationResult> {
  const r = reason.trim();
  if (r.length < 2) return { ok: false, error: "제외 사유를 입력하세요. (예: 해당 없음 — 라이선스만 납품)" };
  const supabase = await createClient();
  const { error } = await supabase.from("deal_tasks").update({ excluded_reason: r }).eq("id", taskId);
  return done(error);
}

export async function addTask(dealId: string, input: { type: TaskType; dueDate?: string; title?: string }): Promise<MutationResult> {
  if (!TASK_TYPES.includes(input.type)) return { ok: false, error: "알 수 없는 업무 유형입니다." };
  if (input.type === "custom" && !input.title?.trim()) return { ok: false, error: "기타 업무는 제목이 필요합니다." };
  if (input.dueDate && !isDate(input.dueDate)) return { ok: false, error: "날짜 형식이 올바르지 않습니다." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("deal_tasks").insert({
    deal_id: dealId,
    type: input.type,
    title: input.title?.trim() || null,
    due_date: input.dueDate || null,
    assignee_id: auth.user?.id ?? null,
  });
  return done(error);
}

export async function addIssue(dealId: string, title: string): Promise<MutationResult> {
  const t = title.trim();
  if (!t) return { ok: false, error: "이슈 내용을 입력하세요." };
  const supabase = await createClient();
  const { error } = await supabase.from("issues").insert({ deal_id: dealId, title: t });
  return done(error);
}

export async function resolveIssue(issueId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("issues").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", issueId);
  return done(error);
}
