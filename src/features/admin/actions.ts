"use server";

// 관리자 조치 (설계서 §5.4). 권한은 DB(RLS·관리자 함수)가 최종 판단한다.
import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";
import { parseSettingsInput } from "@/features/deals/pipeline-settings";

export type AdminResult = { ok: boolean; error?: string };

async function finish(error: { message: string } | null): Promise<AdminResult> {
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function setJoinCode(teamId: string, code: string): Promise<AdminResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_join_code", { p_team_id: teamId, p_code: code });
  return finish(error);
}

export async function setUserActive(userId: string, active: boolean): Promise<AdminResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  return finish(error);
}

export async function restoreItem(kind: "deal" | "company", id: string): Promise<AdminResult> {
  const supabase = await createClient();
  const { error } = await supabase.from(kind === "deal" ? "deals" : "companies").update({ deleted_at: null }).eq("id", id);
  return finish(error);
}

/** 부문 파이프라인 설정 저장 (관리자만 — RLS 가 막는다) */
export async function savePipelineSettings(
  teamId: string,
  input: { probabilities: Record<string, string>; staleAfterDays: string; aiCoachEnabled?: boolean },
): Promise<AdminResult> {
  const parsed = parseSettingsInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("team_pipeline_settings").upsert({ team_id: teamId, ...parsed.value }, { onConflict: "team_id" });
  return finish(error);
}

/** Supabase 토큰 만료일 기록 (관리자만 — RLS). 빈 값이면 지운다 */
export async function saveTokenExpiry(date: string): Promise<AdminResult> {
  const v = (date ?? "").trim();
  if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) return { ok: false, error: "날짜 형식이 올바르지 않습니다." };
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ key: "supabase_token_expires_on", value: v || null }, { onConflict: "key" });
  return finish(error);
}
