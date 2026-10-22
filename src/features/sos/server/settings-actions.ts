"use server";

import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";
import {
  diffKeyword,
  parseChangeId,
  parseKeywordPatch,
  parseProductInput,
  parseTeamSettingsPatch,
  planAddKeywords,
  planRevert,
  type ChangeAction,
  type ChangeFields,
  type KeywordPatch,
  type KeywordSnapshot,
} from "../lib/keyword-edit";
import { parseTier } from "../lib/lead-input";
import type { Tier } from "../types";
import { requireSosTeam } from "./context";

// 설정 화면의 키워드·제품·부문 설정 변경. 로그인 사용자 클라이언트(RLS)만 쓴다 — 관리자 클라이언트 금지.
// 부문은 requireSosTeam 으로만 정하고(요청의 부문 id 를 믿지 않는다), 모든 쿼리에 team_id 조건을 명시한다.
// 키워드 변경은 모두 sos_keyword_changes 에 남긴다. 다음 실행·[재분석]부터 리드에 반영된다.

export type SettingsResult = { ok: boolean; error?: string };
export type AddKeywordsResult = SettingsResult & { added?: number; notice?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { message: string; code?: string };

const BAD = { ok: false, error: "잘못된 요청입니다." };
const FAILED = { ok: false, error: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
const NO_LOG = { ok: false, error: "변경은 저장했지만 변경 이력을 남기지 못했습니다." };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const team = (t: unknown) => (typeof t === "string" ? t : null);
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

// 오류 원인은 서버 로그에만 남기고 화면에는 일반 문구를 돌려준다 (SosDbError 와 같은 형식)
function logDb(where: string, e: DbError) {
  console.error(`[sos] ${where}: ${e.code ?? ""} ${e.message}`);
}

type ChangeRow = { keyword_id: string; action: ChangeAction; before: ChangeFields | null; after: ChangeFields | null };

/** 변경 이력 기록. 기록자는 본인(RLS 가 actor_id = auth.uid() 를 확인한다) */
async function logChanges(supabase: Supabase, teamId: string, actorId: string, rows: ChangeRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const { error } = await supabase.from("sos_keyword_changes").insert(rows.map((r) => ({ team_id: teamId, actor_id: actorId, ...r })));
  if (error) logDb("키워드 변경 이력", error);
  return !error;
}

type KeywordDbRow = { id: string; term: string; tier: Tier; weight: number | null; active: boolean; deleted_at: string | null };

/** 부문의 키워드 하나 + 연결 제품 (삭제된 것 포함). 다른 부문이면 null */
async function loadKeyword(supabase: Supabase, teamId: string, id: string): Promise<{ row: KeywordDbRow; snap: KeywordSnapshot } | null | DbError> {
  const k = await supabase
    .from("sos_keywords")
    .select("id, term, tier, weight, active, deleted_at")
    .eq("id", id)
    .eq("team_id", teamId)
    .maybeSingle();
  if (k.error) return k.error;
  if (!k.data) return null;
  const links = await supabase.from("sos_keyword_products").select("product_id").eq("keyword_id", id);
  if (links.error) return links.error;
  const row = k.data as KeywordDbRow;
  return {
    row,
    snap: {
      term: row.term,
      tier: row.tier,
      weight: row.weight,
      active: row.active,
      productIds: ((links.data ?? []) as { product_id: string }[]).map((l) => l.product_id),
    },
  };
}

const isDbError = (v: unknown): v is DbError => typeof v === "object" && v !== null && "message" in v;

/** 입력창 Enter·쉼표 일괄 추가. 이미 있는 키워드는 건너뛰고 알려 준다 (한 건 때문에 전체를 실패시키지 않는다) */
export async function addKeywords(raw: string, tier: Tier, teamParam?: string | null): Promise<AddKeywordsResult> {
  const tr = parseTier(tier);
  if (!tr || typeof raw !== "string") return BAD;
  const { user, teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();

  const ex = await supabase.from("sos_keywords").select("term").eq("team_id", teamId).is("deleted_at", null);
  if (ex.error) {
    logDb("키워드 중복 확인", ex.error);
    return FAILED;
  }
  const plan = planAddKeywords(raw, ((ex.data ?? []) as { term: string }[]).map((k) => k.term));
  if (!plan.ok) return plan;
  const duplicates = [...plan.duplicates];

  // 한 건씩 넣는다 — 그 사이 다른 사람이 같은 키워드를 넣어도(23505) 나머지는 들어간다
  const created: { id: string; term: string }[] = [];
  let failed = false;
  for (const term of plan.fresh) {
    const ins = await supabase
      .from("sos_keywords")
      .insert({ team_id: teamId, term, tier: tr, weight: null, created_by: user.id })
      .select("id")
      .single();
    if (ins.error) {
      if (ins.error.code === "23505") duplicates.push(term);
      else {
        logDb("키워드 추가", ins.error);
        failed = true;
      }
      continue;
    }
    created.push({ id: (ins.data as { id: string }).id, term });
  }

  const logged = await logChanges(
    supabase,
    teamId,
    user.id,
    created.map((c) => ({ keyword_id: c.id, action: "create", before: null, after: { term: c.term, tier: tr } })),
  );
  if (created.length > 0) refresh();

  const notice = duplicates.length > 0 ? `이미 있는 키워드: ${duplicates.join(", ")}` : undefined;
  if (failed) return { ok: false, added: created.length, error: "일부 키워드를 추가하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", notice };
  if (!logged) return { ...NO_LOG, added: created.length, notice };
  if (created.length === 0) return { ok: false, added: 0, error: notice ?? "추가할 키워드가 없습니다." };
  return { ok: true, added: created.length, notice };
}

/** 키워드 갱신 + 연결 제품 맞추기. 이력은 호출하는 쪽이 남긴다 */
async function applyPatch(supabase: Supabase, teamId: string, id: string, cur: KeywordSnapshot, patch: KeywordPatch): Promise<SettingsResult> {
  const cols: { tier?: Tier; weight?: number | null; active?: boolean } = {};
  if (patch.tier !== undefined) cols.tier = patch.tier;
  if (patch.weight !== undefined) cols.weight = patch.weight;
  if (patch.active !== undefined) cols.active = patch.active;
  if (Object.keys(cols).length > 0) {
    const upd = await supabase.from("sos_keywords").update(cols).eq("id", id).eq("team_id", teamId).is("deleted_at", null).select("id");
    if (upd.error) {
      if (upd.error.code === "23514") return BAD;
      logDb("키워드 수정", upd.error);
      return FAILED;
    }
    if (!upd.data || upd.data.length === 0) return { ok: false, error: "키워드를 찾을 수 없습니다." };
  }

  if (patch.productIds !== undefined) {
    const want = new Set(patch.productIds);
    const have = new Set(cur.productIds.map((p) => p.toLowerCase()));
    const add = [...want].filter((p) => !have.has(p));
    const remove = cur.productIds.filter((p) => !want.has(p.toLowerCase()));
    if (add.length > 0) {
      // 같은 부문의 제품만 붙인다 (RLS 도 막지만 이유를 알려 주려고 먼저 확인)
      const own = await supabase.from("sos_products").select("id").eq("team_id", teamId).in("id", add);
      if (own.error) {
        logDb("연결 제품 확인", own.error);
        return FAILED;
      }
      if ((own.data ?? []).length !== add.length) return { ok: false, error: "같은 부문의 제품만 연결할 수 있습니다." };
      const ins = await supabase.from("sos_keyword_products").insert(add.map((product_id) => ({ keyword_id: id, product_id })));
      if (ins.error && ins.error.code !== "23505") {
        logDb("연결 제품 추가", ins.error);
        return FAILED;
      }
    }
    if (remove.length > 0) {
      const del = await supabase.from("sos_keyword_products").delete().eq("keyword_id", id).in("product_id", remove);
      if (del.error) {
        logDb("연결 제품 해제", del.error);
        return FAILED;
      }
    }
  }
  return { ok: true };
}

/** 칩 팝오버: 칸·가중치·켜기/끄기·연결 제품 */
export async function updateKeyword(
  id: string,
  patch: { tier?: Tier; weight?: number | null; active?: boolean; productIds?: string[] },
  teamParam?: string | null,
): Promise<SettingsResult> {
  const kid = uuid(id);
  const parsed = parseKeywordPatch(patch);
  if (!kid) return BAD;
  if (!parsed.ok) return parsed;
  const { user, teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();

  const k = await loadKeyword(supabase, teamId, kid);
  if (isDbError(k)) {
    logDb("키워드 수정 전 조회", k);
    return FAILED;
  }
  if (!k || k.row.deleted_at) return { ok: false, error: "키워드를 찾을 수 없습니다." };
  const diff = diffKeyword(k.snap, parsed.patch);
  if (!diff) return { ok: true };

  const r = await applyPatch(supabase, teamId, kid, k.snap, parsed.patch);
  if (!r.ok) return r;
  const logged = await logChanges(supabase, teamId, user.id, [{ keyword_id: kid, action: "update", ...diff }]);
  refresh();
  return logged ? { ok: true } : NO_LOG;
}

/** 소프트 삭제 (deleted_at). 이력에 남아 [되돌리기]로 복구할 수 있다 */
export async function deleteKeyword(id: string, teamParam?: string | null): Promise<SettingsResult> {
  const kid = uuid(id);
  if (!kid) return BAD;
  const { user, teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();
  const k = await loadKeyword(supabase, teamId, kid);
  if (isDbError(k)) {
    logDb("키워드 삭제 전 조회", k);
    return FAILED;
  }
  if (!k || k.row.deleted_at) return { ok: false, error: "키워드를 찾을 수 없습니다." };
  const r = await setDeleted(supabase, teamId, kid, true);
  if (!r.ok) return r;
  const logged = await logChanges(supabase, teamId, user.id, [
    { keyword_id: kid, action: "delete", before: { term: k.snap.term, tier: k.snap.tier }, after: null },
  ]);
  refresh();
  return logged ? { ok: true } : NO_LOG;
}

async function setDeleted(supabase: Supabase, teamId: string, id: string, deleted: boolean): Promise<SettingsResult> {
  let q = supabase
    .from("sos_keywords")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("team_id", teamId);
  q = deleted ? q.is("deleted_at", null) : q.not("deleted_at", "is", null);
  const { data, error } = await q.select("id");
  if (error) {
    // 복구하려는데 같은 이름의 키워드가 이미 살아 있다 (sos_keywords_team_term_uq)
    if (error.code === "23505") return { ok: false, error: "같은 이름의 키워드가 이미 있어 복구할 수 없습니다." };
    logDb(deleted ? "키워드 삭제" : "키워드 복구", error);
    return FAILED;
  }
  if (!data || data.length === 0) return { ok: false, error: deleted ? "이미 삭제된 키워드입니다." : "이미 복구된 키워드입니다." };
  return { ok: true };
}

/** 이력 한 줄 되돌리기 — 추가·복구는 삭제로, 삭제는 복구로, 수정은 before 값으로. 자기 부문 이력만 */
export async function revertKeywordChange(changeId: number, teamParam?: string | null): Promise<SettingsResult> {
  const cid = parseChangeId(changeId);
  if (!cid) return BAD;
  const { user, teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();

  const ch = await supabase
    .from("sos_keyword_changes")
    .select("id, keyword_id, action, before, after")
    .eq("id", cid)
    .eq("team_id", teamId)
    .maybeSingle();
  if (ch.error) {
    logDb("변경 이력 조회", ch.error);
    return FAILED;
  }
  const change = ch.data as { keyword_id: string | null; action: ChangeAction; before: unknown; after: unknown } | null;
  if (!change) return { ok: false, error: "변경 이력을 찾을 수 없습니다." };
  if (!change.keyword_id) return { ok: false, error: "키워드를 찾을 수 없습니다." };

  const k = await loadKeyword(supabase, teamId, change.keyword_id);
  if (isDbError(k)) {
    logDb("되돌리기 전 키워드 조회", k);
    return FAILED;
  }
  const plan = planRevert(change, k ? { deleted: k.row.deleted_at !== null } : null);
  if (plan.kind === "error" || !k) return { ok: false, error: plan.kind === "error" ? plan.error : "키워드를 찾을 수 없습니다." };
  const kid = k.row.id;
  const label = { term: k.snap.term, tier: k.snap.tier };

  let log: ChangeRow;
  if (plan.kind === "delete") {
    const r = await setDeleted(supabase, teamId, kid, true);
    if (!r.ok) return r;
    log = { keyword_id: kid, action: "delete", before: label, after: null };
  } else if (plan.kind === "restore") {
    const r = await setDeleted(supabase, teamId, kid, false);
    if (!r.ok) return r;
    log = { keyword_id: kid, action: "restore", before: null, after: label };
  } else {
    // 이력의 제품이 그 뒤 지워졌으면 남은 제품만 되돌린다
    let patch = plan.patch;
    if (patch.productIds && patch.productIds.length > 0) {
      const own = await supabase.from("sos_products").select("id").eq("team_id", teamId).in("id", patch.productIds);
      if (own.error) {
        logDb("되돌리기 제품 확인", own.error);
        return FAILED;
      }
      const alive = new Set(((own.data ?? []) as { id: string }[]).map((p) => p.id.toLowerCase()));
      patch = { ...patch, productIds: patch.productIds.filter((p) => alive.has(p)) };
    }
    const finalDiff = diffKeyword(k.snap, patch);
    if (!finalDiff) return { ok: false, error: "이미 그 상태입니다." };
    const r = await applyPatch(supabase, teamId, kid, k.snap, patch);
    if (!r.ok) return r;
    log = { keyword_id: kid, action: "update", ...finalDiff };
  }

  const logged = await logChanges(supabase, teamId, user.id, [log]);
  refresh();
  return logged ? { ok: true } : NO_LOG;
}

/** 부문 설정 — 행이 없으면 기본값으로 만들고 고친 칸만 덮는다 */
export async function updateTeamSettings(patch: { prespecAlertDays?: number; aiSummaryTopN?: number }, teamParam?: string | null): Promise<SettingsResult> {
  const parsed = parseTeamSettingsPatch(patch);
  if (!parsed.ok) return parsed;
  const { teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();
  // 없는 칸은 insert 때 DB 기본값(3/5/30), 충돌 시에는 넘긴 칸만 바뀐다
  const { error } = await supabase.from("sos_team_settings").upsert({ team_id: teamId, ...parsed.patch }, { onConflict: "team_id" });
  if (error) {
    logDb("부문 설정 저장", error);
    return FAILED;
  }
  refresh();
  return { ok: true };
}

/** 제품 추가 — 같은 부문에 같은 이름이 있으면 거절 */
export async function addProduct(input: { name: string; vendor?: string | null }, teamParam?: string | null): Promise<SettingsResult> {
  const p = parseProductInput(input);
  if (!p.ok) return p;
  const { teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();
  const { error } = await supabase.from("sos_products").insert({ team_id: teamId, ...p.value });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 있는 제품입니다." };
    logDb("제품 추가", error);
    return FAILED;
  }
  refresh();
  return { ok: true };
}

/** 제품 이름·공급사 수정 */
export async function updateProduct(id: string, input: { name: string; vendor?: string | null }, teamParam?: string | null): Promise<SettingsResult> {
  const pid = uuid(id);
  const p = parseProductInput(input);
  if (!pid) return BAD;
  if (!p.ok) return p;
  const { teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();
  const { data, error } = await supabase.from("sos_products").update(p.value).eq("id", pid).eq("team_id", teamId).select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 있는 제품 이름입니다." };
    logDb("제품 수정", error);
    return FAILED;
  }
  if (!data || data.length === 0) return { ok: false, error: "제품을 찾을 수 없습니다." };
  refresh();
  return { ok: true };
}

/** 제품 삭제 — 키워드 연결도 같이 지워진다 (on delete cascade) */
export async function deleteProduct(id: string, teamParam?: string | null): Promise<SettingsResult> {
  const pid = uuid(id);
  if (!pid) return BAD;
  const { teamId } = await requireSosTeam(team(teamParam));
  const supabase = await createClient();
  const { data, error } = await supabase.from("sos_products").delete().eq("id", pid).eq("team_id", teamId).select("id");
  if (error) {
    logDb("제품 삭제", error);
    return FAILED;
  }
  if (!data || data.length === 0) return { ok: false, error: "제품을 찾을 수 없습니다." };
  refresh();
  return { ok: true };
}
