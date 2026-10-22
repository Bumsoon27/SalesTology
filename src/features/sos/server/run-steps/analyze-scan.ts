import "server-only";

import { matchKeywords } from "../../analysis/keywords";
import { continueWith } from "../../run/steps";
import { loadKeywords, must } from "../db";
import { cursorRange, type StepContext, type StepResult } from "./types";

const PAGE = 1000;
const MAX_PAGES = 15;
const BUDGET_MS = 35_000;
const SOURCES = ["g2b_plan", "g2b_prespec", "g2b_bid"];

/**
 * 키워드 훑기: 범위 안 원본(fetched_at 기준)에 부문 키워드를 맞춰 맞은 원본 id 를 커서에 모은다.
 * 한 단계에 다 못 보면 같은 단계를 다시 넣고, 다 보면 저장 단계(save)를 넣는다.
 */
export async function analyzeScanStep(ctx: StepContext, after?: string): Promise<StepResult> {
  const { admin, teamId } = ctx;
  const started = Date.now();
  const scopeFrom = cursorRange(ctx).from.toISOString();
  const keywords = await loadKeywords(admin, teamId);

  const matchedIds = [...(after ? (ctx.cursor.matchedIds ?? []) : [])];
  let last = after;
  // 이어서 훑는 중이면 앞 단계의 수를 이어 센다
  let scanned = after ? ((ctx.stats.analyze as { scanned?: number } | undefined)?.scanned ?? 0) : 0;

  for (let p = 0; p < MAX_PAGES; p++) {
    if (Date.now() - started > BUDGET_MS) break;
    let q = admin
      .from("sos_raw_items")
      .select("id, title, match_text")
      .in("source", SOURCES)
      .gte("fetched_at", scopeFrom)
      .order("id")
      .limit(PAGE);
    if (last) q = q.gt("id", last);
    const rows = must<{ id: string; title: string; match_text: string | null }[]>("원본 훑기", await q) ?? [];
    for (const r of rows) {
      const m = matchKeywords(r.match_text ?? r.title, keywords);
      if (m.matched.length > 0 && !m.excluded) matchedIds.push(r.id);
    }
    scanned += rows.length;
    if (rows.length < PAGE) {
      last = undefined; // 끝까지 봤다
      break;
    }
    last = rows[rows.length - 1].id;
  }

  const base = { ...ctx.cursor, matchedIds };
  const cursor = last
    ? continueWith(base, { kind: "analyze", after: last })
    : continueWith(base, { kind: "analyze", save: true });
  return { cursor, stats: { ...ctx.stats, analyze: { scanned, matched: matchedIds.length } } };
}
