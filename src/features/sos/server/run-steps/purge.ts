import "server-only";

import { selectRunsToPurge } from "../../analysis/retention";
import { DAY_MS } from "../../lib/date";
import { chunk, IN_LIST, must, selectAll, type Admin } from "../db";
import type { StepContext, StepResult } from "./types";

const RAW_KEEP_DAYS = 14;
// 오래된 미참조 원본: 한 쪽 500건, 한 실행에 최대 10쪽 — 나머지는 다음 실행에서
const RAW_PAGE = 500;
const RAW_MAX_PAGES = 10;

/** 보관 정리 (설계서 §4.3). 실패해도 실행은 계속한다 — 경고로만 남긴다 */
export async function purgeStep(ctx: StepContext): Promise<StepResult> {
  const { admin, teamId, now } = ctx;
  try {
    // 1) 보관 범위를 벗어난 실행 (시그널은 cascade 로 같이 지워진다)
    const runs = await selectAll<{ id: string; started_at: string }>("실행 목록", (from, to) =>
      admin.from("sos_runs").select("id, started_at").eq("team_id", teamId).order("started_at").range(from, to),
    );
    const runIds = selectRunsToPurge(
      runs.map((r) => ({ id: r.id, startedAt: r.started_at })),
      now,
    ).filter((id) => id !== ctx.run.id);
    for (const ids of chunk(runIds, IN_LIST)) {
      must("실행 정리", await admin.from("sos_runs").delete().eq("team_id", teamId).in("id", ids));
    }

    // 2) 사람이 손대지 않았고 남은 시그널이 없는 리드
    const leads = await selectAll<{ id: string; sos_signals: { count: number }[] }>("정리 대상 리드", (from, to) =>
      admin
        .from("sos_leads")
        .select("id, sos_signals(count)")
        .eq("team_id", teamId)
        .is("touched_at", null)
        .order("id")
        .range(from, to),
    );
    const orphanLeads = leads.filter((l) => (l.sos_signals?.[0]?.count ?? 0) === 0).map((l) => l.id);
    for (const ids of chunk(orphanLeads, IN_LIST)) {
      must("리드 정리", await admin.from("sos_leads").delete().eq("team_id", teamId).is("touched_at", null).in("id", ids));
    }

    // 3) 14일 지난, 어떤 부문의 시그널도 가리키지 않는 원본 (공용 테이블)
    const cutoff = new Date(now.getTime() - RAW_KEEP_DAYS * DAY_MS).toISOString();
    const rawItems = await purgeRawItems(admin, cutoff);

    return {
      cursor: ctx.cursor,
      stats: { ...ctx.stats, purge: { runs: runIds.length, leads: orphanLeads.length, rawItems } },
    };
  } catch (e) {
    // 'error' 키를 쓰지 않는다 — 정리 실패로 실행이 partial 이 되지 않게. 서버 로그에는 남긴다 (DB 오류 상세는 SosDbError 가 이미 남김)
    const message = e instanceof Error ? e.message : "정리 실패";
    console.error(`[sos] purge: ${message}`);
    return { cursor: ctx.cursor, stats: { ...ctx.stats, purge: { warning: message } } };
  }
}

/**
 * 14일 지난, 어떤 부문의 시그널도 가리키지 않는 원본 삭제 (공용 테이블).
 * 반(anti) 조인(sos_signals is null)으로 미참조 행만 받으므로 참조 중인 오래된 행에 막히지 않는다.
 */
async function purgeRawItems(admin: Admin, cutoff: string): Promise<number> {
  let deleted = 0;
  const skipped = new Set<string>();
  for (let p = 0; p < RAW_MAX_PAGES; p++) {
    const rows = must<{ id: string }[]>(
      "오래된 원본",
      await admin
        .from("sos_raw_items")
        .select("id, sos_signals!left(id)")
        .is("sos_signals", null)
        .lt("fetched_at", cutoff)
        .order("fetched_at")
        .order("id")
        .limit(RAW_PAGE),
    ) ?? [];
    const ids = rows.map((r) => r.id).filter((id) => !skipped.has(id));
    if (ids.length === 0) break;
    for (const part of chunk(ids, IN_LIST)) deleted += await deleteRaw(admin, cutoff, part, skipped);
    if (rows.length < RAW_PAGE) break;
  }
  return deleted;
}

/** 묶음 삭제가 실패하면(다른 부문 실행이 막 시그널을 단 경우 FK 위반) 한 건씩 지우고 실패한 건은 건너뛴다 */
async function deleteRaw(admin: Admin, cutoff: string, ids: string[], skipped: Set<string>): Promise<number> {
  const { error } = await admin.from("sos_raw_items").delete().lt("fetched_at", cutoff).in("id", ids);
  if (!error) return ids.length;
  console.error(`[sos] purge raw batch: ${error.code ?? ""} ${error.message}`);
  let n = 0;
  for (const id of ids) {
    const r = await admin.from("sos_raw_items").delete().lt("fetched_at", cutoff).eq("id", id);
    if (r.error) skipped.add(id);
    else n++;
  }
  return n;
}
