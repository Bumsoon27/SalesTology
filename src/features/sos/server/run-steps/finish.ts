import "server-only";

import { todayInSeoul } from "../../lib/date";
import { finalStatus, opLabel, type RunStep } from "../../run/steps";
import { must } from "../db";
import type { OpStats } from "./fetch";
import { cursorRange, type StepContext, type StepResult } from "./types";

/** 상태 결정 + 이번에 실제로 받은 업무만 sos_fetch_log 에 남긴다 (다른 부문의 원본 재사용 판단용) */
export async function finishStep(ctx: StepContext): Promise<StepResult> {
  const { admin } = ctx;
  const status = finalStatus(ctx.stats);
  const range = cursorRange(ctx);
  const day = { from: todayInSeoul(range.from), to: todayInSeoul(range.to) };

  const labels = new Set(
    ctx.cursor.steps
      .filter((s): s is Extract<RunStep, { kind: "fetch" }> => s.kind === "fetch")
      .map((s) => opLabel(s.op)),
  );
  const logs = [...labels].flatMap((label) => {
    const st = ctx.stats[label] as OpStats | undefined;
    if (!st || st.error || st.skipped) return [];
    return [{ source: label, range_from: day.from, range_to: day.to, item_count: st.fetched ?? 0 }];
  });
  if (logs.length > 0) must("수집 기록 저장", await admin.from("sos_fetch_log").insert(logs));

  return { cursor: { ...ctx.cursor, matchedIds: [] }, stats: ctx.stats, status };
}
