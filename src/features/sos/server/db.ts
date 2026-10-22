import "server-only";

import type { createAdminClient } from "@/shared/supabase/admin";
import { g2bKeywords } from "../run/convert";
import type { Keyword } from "../types";
import type { KeywordRow, LeadRow, TeamSettings } from "./rows";

// 관리자 클라이언트 공통 조회. 부문 데이터 조회는 모두 teamId 조건을 명시한다 (RLS 우회 경로).
export type Admin = ReturnType<typeof createAdminClient>;

type DbResult = { data: unknown; error: { message: string; code?: string } | null };

/** DB 오류 — 메시지에 비밀값은 없지만 화면에는 일반 문구만 보여 준다 */
export class SosDbError extends Error {
  constructor(where: string, cause: { message: string; code?: string }) {
    super(`DB 오류 (${where})`);
    this.name = "SosDbError";
    console.error(`[sos] ${where}: ${cause.code ?? ""} ${cause.message}`);
  }
}

export function must<T>(where: string, r: DbResult): T {
  if (r.error) throw new SosDbError(where, r.error);
  return r.data as T;
}

/** 1000행 제한을 넘는 조회 — 정렬이 고정된 쿼리를 쪽 단위로 이어 받는다 */
export async function selectAll<T>(
  where: string,
  page: (from: number, to: number) => PromiseLike<DbResult>,
  pageSize = 1000,
  max = 100_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const rows = must<T[]>(where, await page(from, from + pageSize - 1)) ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// in() 목록은 URL 에 실리므로 길이를 제한한다 (uuid 100개 ≈ 3.7KB, 한글 이름은 퍼센트 인코딩으로 길어져 40개)
export const IN_LIST = 100;
export const IN_LIST_NAMES = 40;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const DEFAULT_SETTINGS: TeamSettings = { prespecAlertDays: 3, aiSummaryTopN: 5, firstRunDays: 30 };

/** 부문 설정 — 행이 없으면 기본값 */
export async function loadSettings(admin: Admin, teamId: string): Promise<TeamSettings> {
  const row = must<{ prespec_alert_days: number; ai_summary_top_n: number; first_run_days: number } | null>(
    "설정 조회",
    await admin
      .from("sos_team_settings")
      .select("prespec_alert_days, ai_summary_top_n, first_run_days")
      .eq("team_id", teamId)
      .maybeSingle(),
  );
  if (!row) return DEFAULT_SETTINGS;
  return { prespecAlertDays: row.prespec_alert_days, aiSummaryTopN: row.ai_summary_top_n, firstRunDays: row.first_run_days };
}

/** 부문의 살아 있는 조달 키워드 (제외 키워드 포함) */
export async function loadKeywords(admin: Admin, teamId: string): Promise<Keyword[]> {
  const rows = must<KeywordRow[]>(
    "키워드 조회",
    await admin
      .from("sos_keywords")
      .select("id, term, tier, weight, active, sources")
      .eq("team_id", teamId)
      .eq("active", true)
      .is("deleted_at", null),
  );
  return g2bKeywords(rows ?? []);
}

export const LEAD_COLUMNS =
  "id, team_id, chain_key, org_id, title, stage, budget, expected_order_month, next_deadline_at, next_deadline_type, matched_keyword_ids, score, status, touched_at, hidden, has_new_progress, keyword_mismatch";

/** 부문의 조달 사업 리드 전체 (합쳐진 리드 제외) */
export async function loadLeads(admin: Admin, teamId: string): Promise<LeadRow[]> {
  return selectAll<LeadRow>("리드 조회", (from, to) =>
    admin
      .from("sos_leads")
      .select(LEAD_COLUMNS)
      .eq("team_id", teamId)
      .eq("kind", "deal")
      .is("merged_into_id", null)
      .order("id")
      .range(from, to),
  );
}

/** 기관 id → 최근 시그널이 걸린 리드 id 집합 (겹침 점수용) */
export async function loadOrgMembers(admin: Admin, teamId: string, since: Date): Promise<Map<string, Set<string>>> {
  const rows = await selectAll<{ lead_id: string | null; sos_raw_items: { org_id: string | null } | null }>(
    "기관 시그널 조회",
    (from, to) =>
      admin
        .from("sos_signals")
        .select("lead_id, sos_raw_items(org_id)")
        .eq("team_id", teamId)
        .gte("created_at", since.toISOString())
        .not("lead_id", "is", null)
        .order("id")
        .range(from, to),
  );
  const members = new Map<string, Set<string>>();
  for (const r of rows) {
    const org = r.sos_raw_items?.org_id;
    if (!org || !r.lead_id) continue;
    const set = members.get(org) ?? new Set<string>();
    set.add(r.lead_id);
    members.set(org, set);
  }
  return members;
}
