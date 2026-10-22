"use server";

import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";
import { normalizeKeywordTerm, parseLeadPatch, parseTier, type EditableStatus } from "../lib/lead-input";
import { parseLeadId } from "../lib/lead-view";
import type { Tier } from "../types";
import { requireSosTeam } from "./context";

// 카드에서 사람이 바꾸는 값. 로그인 사용자 클라이언트(RLS)만 쓴다 — 관리자 클라이언트 금지.
// 부문은 requireSosTeam 으로만 정하고, 모든 쿼리에 team_id 조건을 명시한다.

export type UpdateLeadResult = { ok: true } | { ok: false; error: string; conflict?: boolean };

const CONFLICT = { ok: false as const, conflict: true, error: "다른 사람이 먼저 수정했습니다." };
const FAILED = { ok: false as const, error: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
const team = (t: unknown) => (typeof t === "string" ? t : null);

// 오류 원인은 서버 로그에만 남기고 화면에는 일반 문구를 돌려준다 (SosDbError 와 같은 형식)
function logDb(where: string, e: { message: string; code?: string }) {
  console.error(`[sos] ${where}: ${e.code ?? ""} ${e.message}`);
}

/** 담당·상태·메모 수정. expectedUpdatedAt 이 지금 값과 다르면 덮어쓰지 않는다 (설계서 §7) */
export async function updateLead(
  leadId: string,
  patch: { status?: EditableStatus; assigneeId?: string | null; memo?: string },
  expectedUpdatedAt: string,
  teamParam?: string | null,
): Promise<UpdateLeadResult> {
  const id = parseLeadId(typeof leadId === "string" ? leadId : undefined);
  const parsed = parseLeadPatch(patch);
  if (!id || typeof expectedUpdatedAt !== "string" || expectedUpdatedAt === "") return { ok: false, error: "잘못된 요청입니다." };
  if (!parsed.ok) return parsed;
  const { teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();

  const cur = await supabase
    .from("sos_leads")
    .select("status, touched_at, updated_at")
    .eq("id", id)
    .eq("team_id", teamId)
    .maybeSingle();
  if (cur.error) {
    logDb("리드 수정 전 조회", cur.error);
    return FAILED;
  }
  const row = cur.data as { status: string; touched_at: string | null; updated_at: string } | null;
  if (!row) return { ok: false, error: "리드를 찾을 수 없습니다." };
  if (row.updated_at !== expectedUpdatedAt) return CONFLICT;
  // 전환된 리드의 상태는 사업 쪽과 어긋나지 않게 바꾸지 않는다
  if (row.status === "converted" && parsed.patch.status) return { ok: false, error: "사업으로 전환된 리드는 상태를 바꿀 수 없습니다." };

  if (parsed.patch.assignee_id) {
    // RLS 도 막지만, 거절 이유를 알려 주려고 먼저 확인한다
    const m = await supabase
      .from("profiles")
      .select("id")
      .eq("id", parsed.patch.assignee_id)
      .eq("team_id", teamId)
      .eq("is_active", true)
      .maybeSingle();
    if (m.error) {
      logDb("담당자 확인", m.error);
      return FAILED;
    }
    if (!m.data) return { ok: false, error: "담당자는 같은 부문의 사용자만 지정할 수 있습니다." };
  }

  // 사람이 처음 손댄 시각 — 있으면 보관 정리에서 빠진다. 이미 있으면 덮지 않는다
  const values = row.touched_at ? parsed.patch : { ...parsed.patch, touched_at: new Date().toISOString() };
  const upd = await supabase
    .from("sos_leads")
    .update(values)
    .eq("id", id)
    .eq("team_id", teamId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id");
  if (upd.error) {
    logDb("리드 수정", upd.error);
    return FAILED;
  }
  // 읽은 뒤 그 사이에 다른 사람이 저장했다
  if (!upd.data || upd.data.length === 0) return CONFLICT;
  refresh();
  return { ok: true };
}

/** 보류 리드를 열면 "새 진행" 표시를 지운다. 사람이 손댄 것은 아니므로 touched_at 은 그대로 */
export async function markLeadSeen(leadId: string, teamParam?: string | null): Promise<void> {
  const id = parseLeadId(typeof leadId === "string" ? leadId : undefined);
  if (!id) return;
  const { teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sos_leads")
    .update({ has_new_progress: false })
    .eq("id", id)
    .eq("team_id", teamId)
    .eq("status", "on_hold")
    .eq("has_new_progress", true)
    .select("id");
  if (error) {
    logDb("새 진행 확인 표시", error);
    return;
  }
  if (data && data.length > 0) refresh();
}

/** 카드 제목에서 드래그로 고른 글자를 키워드로 추가 (설계서 §5.5). 다음 실행·[재분석]부터 반영된다 */
export async function addKeywordFromSelection(term: string, tier: Tier, teamParam?: string | null): Promise<{ ok: boolean; error?: string }> {
  const t = normalizeKeywordTerm(term);
  const tr = parseTier(tier);
  if (!t.ok) return { ok: false, error: t.error };
  if (!tr) return { ok: false, error: "잘못된 요청입니다." };
  const { user, teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();

  // 가중치는 비워 두면 칸 기본값
  const ins = await supabase
    .from("sos_keywords")
    .insert({ team_id: teamId, term: t.term, tier: tr, weight: null, created_by: user.id })
    .select("id")
    .single();
  if (ins.error) {
    // 부문 안에서 대소문자 무시 중복 (sos_keywords_team_term_uq)
    if (ins.error.code === "23505") return { ok: false, error: "이미 있는 키워드입니다." };
    logDb("키워드 추가", ins.error);
    return { ok: false, error: "키워드를 추가하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }
  const keywordId = (ins.data as { id: string }).id;

  const log = await supabase.from("sos_keyword_changes").insert({
    team_id: teamId,
    actor_id: user.id,
    keyword_id: keywordId,
    action: "create",
    after: { term: t.term, tier: tr },
  });
  refresh();
  if (log.error) {
    logDb("키워드 변경 이력", log.error);
    return { ok: false, error: "키워드는 추가했지만 변경 이력을 남기지 못했습니다." };
  }
  return { ok: true };
}
