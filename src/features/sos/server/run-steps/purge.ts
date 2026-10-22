import "server-only";

import { selectRunsToPurge } from "../../analysis/retention";
import { chunk, IN_LIST, must, selectAll } from "../db";
import type { StepContext, StepResult } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const RAW_KEEP_DAYS = 14;
// 한 번에 살펴볼 오래된 원본 수 — 나머지는 다음 실행에서
const RAW_SCAN_LIMIT = 2000;

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
    const old = must<{ id: string; sos_signals: { count: number }[] }[]>(
      "오래된 원본",
      await admin
        .from("sos_raw_items")
        .select("id, sos_signals(count)")
        .lt("fetched_at", cutoff)
        .order("fetched_at")
        .limit(RAW_SCAN_LIMIT),
    );
    const orphanRaw = (old ?? []).filter((r) => (r.sos_signals?.[0]?.count ?? 0) === 0).map((r) => r.id);
    for (const ids of chunk(orphanRaw, IN_LIST)) {
      must("원본 정리", await admin.from("sos_raw_items").delete().lt("fetched_at", cutoff).in("id", ids));
    }

    return {
      cursor: ctx.cursor,
      stats: { ...ctx.stats, purge: { runs: runIds.length, leads: orphanLeads.length, rawItems: orphanRaw.length } },
    };
  } catch (e) {
    // 'error' 키를 쓰지 않는다 — 정리 실패로 실행이 partial 이 되지 않게
    return { cursor: ctx.cursor, stats: { ...ctx.stats, purge: { warning: e instanceof Error ? e.message : "정리 실패" } } };
  }
}
