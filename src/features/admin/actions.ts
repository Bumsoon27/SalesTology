"use server";

// 관리자 조치 (설계서 §5.4). 권한은 DB(RLS·관리자 함수)가 최종 판단한다.
import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";

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
