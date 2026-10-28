"use server";

// 상세 패널에서 바로 처리하는 조치 (설계서 §6.5). 권한은 RLS, 동시 수정은 updated_at 비교(§8).
import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";
import type { DealStage, DealStatus, TaskType } from "./types";
import { toDealInfoPatch, type DealInfoInput } from "./edit";
import { toNoteRow, type NoteInput } from "./notes";
import { todayInSeoul } from "./status";

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
  // 서버 액션은 누구나 임의 인자로 부를 수 있다 → 받은 객체를 그대로 쓰지 않고 허용한 두 칸만 옮긴다
  const safe: { stage?: DealStage; status?: DealStatus } = {};
  if (patch?.stage !== undefined) {
    if (!STAGES.includes(patch.stage)) return { ok: false, error: "알 수 없는 단계입니다." };
    safe.stage = patch.stage;
  }
  if (patch?.status !== undefined) {
    if (!STATUSES.includes(patch.status)) return { ok: false, error: "알 수 없는 상태입니다." };
    safe.status = patch.status;
  }
  if (!safe.stage && !safe.status) return { ok: false, error: "바꿀 내용이 없습니다." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .update(safe)
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
  if ((input.title?.trim().length ?? 0) > 100) return { ok: false, error: "업무 제목은 100자 이하로 입력하세요." };
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

/** 고객사 바꾸기 — 이름으로 찾고 없으면 만든다 */
export async function setDealCustomer(dealId: string, name: string, expectedUpdatedAt: string): Promise<MutationResult> {
  if (!name?.trim()) return { ok: false, error: "고객사명을 입력하세요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_deal_customer", { p_deal_id: dealId, p_name: name.trim(), p_expected_updated_at: expectedUpdatedAt });
  if (error) return { ok: false, error: error.message };
  if (data === false) return { ok: false, error: "다른 사람이 먼저 수정했습니다. 새 값을 확인한 뒤 다시 적용해 주세요.", conflict: true };
  refresh();
  return { ok: true };
}

/** SI·매입처 추가 */
export async function addDealParty(dealId: string, name: string, role: "si" | "supplier"): Promise<MutationResult> {
  if (!name?.trim()) return { ok: false, error: "회사명을 입력하세요." };
  if (role !== "si" && role !== "supplier") return { ok: false, error: "알 수 없는 역할입니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_deal_party", { p_deal_id: dealId, p_name: name.trim(), p_role: role });
  return done(error);
}

/** SI·매입처 빼기 */
export async function removeDealParty(partyId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_deal_party", { p_party_id: partyId });
  return done(error);
}

/** 회사 이름 자동완성 후보 (내 부문) */
export async function listCompanyOptions(): Promise<{ name: string; roles: string[] }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("name, partner_roles").is("deleted_at", null).order("name").limit(500);
  return ((data ?? []) as { name: string; partner_roles: string[] | null }[]).map((c) => ({ name: c.name, roles: c.partner_roles ?? [] }));
}

/** 활동 기록 추가 (통화·미팅·메일·메모). 기록자는 DB 정책상 본인으로만 들어간다 */
export async function addDealNote(dealId: string, input: NoteInput): Promise<MutationResult> {
  const mapped = toNoteRow(input, todayInSeoul());
  if (!mapped.ok) return { ok: false, error: mapped.error };
  const supabase = await createClient();
  const { error } = await supabase.from("deal_notes").insert({ deal_id: dealId, ...mapped.row });
  return done(error);
}

/** 활동 기록 지우기 — 쓴 사람만 (RLS). 지워진 행이 없으면 권한이 없거나 이미 지워진 것 */
export async function deleteDealNote(noteId: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deal_notes").delete().eq("id", noteId).select("id");
  if (!error && (!data || data.length === 0)) return { ok: false, error: "직접 쓴 기록만 지울 수 있습니다." };
  return done(error);
}

/** 사업 삭제 (소프트 삭제). 담당자 또는 관리자만 — DB 트리거가 한 번 더 막는다. 복구는 관리자 화면에서 */
export async function deleteDeal(dealId: string, expectedUpdatedAt: string): Promise<MutationResult> {
  const supabase = await createClient();
  // 삭제된 사업은 일반 사용자에게 조회되지 않으므로(RLS) 행을 돌려받지 않고 바뀐 개수로 확인한다
  const { error, count } = await supabase
    .from("deals")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", dealId)
    .eq("updated_at", expectedUpdatedAt);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "다른 사람이 먼저 수정했습니다. 새 값을 확인한 뒤 다시 시도해 주세요.", conflict: true };
  refresh();
  return { ok: true };
}
