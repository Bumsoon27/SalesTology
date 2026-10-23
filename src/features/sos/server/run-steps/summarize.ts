import "server-only";

import { DAY_MS, daysUntil, todayInSeoul } from "../../lib/date";
import { STAGE_LABEL } from "../../lib/labels";
import { parseAmount } from "../../lib/money";
import { dateToMonth, othersInOrg } from "../../run/convert";
import { continueWith } from "../../run/steps";
import { aiCallsLeft } from "../../summary/daily-cap";
import { summarizeWithGemini } from "../../summary/gemini";
import { needsAiSummary, shouldWriteTemplate } from "../../summary/keep";
import { templateSummary } from "../../summary/template";
import type { DeadlineType, Stage } from "../../types";
import { chunk, loadOrgMembers, loadSettings, must, selectAll, type Admin } from "../db";
import { geminiKey } from "../env";
import type { StepContext, StepResult } from "./types";

// Gemini 호출은 건당 최대 10초 — 한 단계에 2건까지만
const AI_PER_STEP = 2;

type SummaryLead = {
  id: string;
  title: string;
  stage: Stage;
  org_id: string | null;
  budget: number | string | null;
  expected_order_month: string | null;
  next_deadline_at: string | null;
  next_deadline_type: DeadlineType | null;
  matched_keyword_ids: string[];
  score: number;
  summary: string | null;
  summary_source: string | null;
  sos_orgs: { name: string } | null;
};
// aiCalls: 이 실행의 Gemini 호출 수(성공·실패 모두) — 하루 상한 계산용. aiCapped: 상한 때문에 건너뛴 수
type SummaryStats = { template?: number; ai?: number; aiFallback?: number; aiCalls?: number; aiCapped?: number };

const COLUMNS =
  "id, title, stage, org_id, budget, expected_order_month, next_deadline_at, next_deadline_type, matched_keyword_ids, score, summary, summary_source, sos_orgs(name)";

// 요약 대상: 숨기지 않은 new·reviewing 조달 리드
const targets = (admin: Admin, teamId: string) =>
  admin
    .from("sos_leads")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .eq("kind", "deal")
    .eq("hidden", false)
    .is("merged_into_id", null)
    .in("status", ["new", "reviewing"]);

export async function summarizeStep(ctx: StepContext, aiOffset?: number): Promise<StepResult> {
  return aiOffset === undefined ? templatePhase(ctx) : aiPhase(ctx, aiOffset);
}

/**
 * 대상에 템플릿 요약 — 문장·출처가 바뀌는 것만 쓰고, AI 요약은 이번 실행에서 사실이 바뀐 리드만 덮는다.
 * 그다음 Gemini 키가 있으면 상위 N건 중 AI 요약이 필요한 것을 하루 상한 안에서 골라 AI 단계를 넣는다.
 */
async function templatePhase(ctx: StepContext): Promise<StepResult> {
  const { admin, teamId, now } = ctx;
  const stale = new Set(ctx.cursor.factsChangedIds ?? []);
  const today = todayInSeoul(now);
  const leads = await selectAll<SummaryLead>("요약 대상 조회", (from, to) => targets(admin, teamId).order("id").range(from, to));
  const terms = await keywordTerms(admin, teamId);
  const members = await loadOrgMembers(admin, teamId, new Date(now.getTime() - 90 * DAY_MS));

  const rows = leads.flatMap((l) => {
    const days = l.next_deadline_at ? daysUntil(l.next_deadline_at, today) : null;
    const summary = templateSummary({
      orgName: l.sos_orgs?.name ?? "수요기관",
      title: l.title,
      orderMonth: dateToMonth(l.expected_order_month),
      budget: parseAmount(l.budget),
      nextDeadlineType: days !== null && days >= 0 ? l.next_deadline_type : null,
      daysLeft: days !== null && days >= 0 ? days : null,
      keywords: l.matched_keyword_ids.map((id) => terms.get(id)).filter((t): t is string => !!t),
      orgSignals: othersInOrg(members, l.org_id, l.id),
    });
    if (!shouldWriteTemplate(l, summary, stale.has(l.id))) return [];
    // upsert 의 필수 칸(team_id·title·stage)은 방금 읽은 값 그대로 — 실행 중 이 칸을 바꾸는 건 이 실행뿐이다
    return [{ id: l.id, team_id: teamId, title: l.title, stage: l.stage, summary, summary_source: "template" }];
  });
  // 행마다 update 하면 요청이 수백 번이라 id 기준 upsert 로 묶어 보낸다 (항상 기존 행 갱신)
  for (const part of chunk(rows, 500)) {
    must("요약 저장", await admin.from("sos_leads").upsert(part, { onConflict: "id" }));
  }

  const settings = await loadSettings(admin, teamId);
  const stats: SummaryStats = { template: rows.length, ai: 0, aiFallback: 0, aiCalls: 0 };
  let aiIds: string[] = [];
  if (geminiKey() !== null && settings.aiSummaryTopN > 0) {
    const want = [...leads]
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, settings.aiSummaryTopN)
      .filter((l) => needsAiSummary(l, stale.has(l.id)));
    const left = want.length > 0 ? aiCallsLeft(await todayRunStats(admin, teamId, ctx.run.id, now)) : 0;
    aiIds = want.slice(0, left).map((l) => l.id);
    if (want.length > aiIds.length) stats.aiCapped = want.length - aiIds.length;
  }
  const cursor = { ...ctx.cursor, aiIds };
  return {
    cursor: aiIds.length > 0 ? continueWith(cursor, { kind: "summarize", aiOffset: 0 }) : cursor,
    stats: { ...ctx.stats, summary: stats },
  };
}

/** 오늘(KST) 시작한 이 부문의 다른 실행 stats — Gemini 하루 상한 계산용 */
async function todayRunStats(admin: Admin, teamId: string, runId: string, now: Date): Promise<unknown[]> {
  const dayStart = new Date(`${todayInSeoul(now)}T00:00:00+09:00`).toISOString();
  const rows = must<{ stats: unknown }[]>(
    "오늘 실행 조회",
    await admin.from("sos_runs").select("stats").eq("team_id", teamId).gte("started_at", dayStart).neq("id", runId),
  );
  return (rows ?? []).map((r) => r.stats);
}

/** 템플릿 단계가 고른 리드(aiIds)만 Gemini(무료 등급)로 다듬는다. 실패하면 템플릿 그대로 둔다 */
async function aiPhase(ctx: StepContext, offset: number): Promise<StepResult> {
  const { admin, teamId } = ctx;
  const prev = (ctx.stats.summary ?? {}) as SummaryStats;
  const apiKey = geminiKey();
  if (!apiKey) return { cursor: ctx.cursor, stats: ctx.stats };

  const ids = ctx.cursor.aiIds ?? [];
  const batchIds = ids.slice(offset, offset + AI_PER_STEP);
  // 실행 중 상태가 바뀌어 대상에서 빠진 리드는 건너뛴다
  const batch = batchIds.length > 0 ? (must<SummaryLead[]>("AI 대상 조회", await targets(admin, teamId).in("id", batchIds)) ?? []) : [];
  const terms = await keywordTerms(admin, teamId);

  let ai = prev.ai ?? 0;
  let fallback = prev.aiFallback ?? 0;
  let calls = prev.aiCalls ?? 0;
  for (const l of batch) {
    const keywordIds = l.matched_keyword_ids;
    // 숫자 칸(예산·마감·발주월)은 넘기지 않는다 — 카드의 숫자 칸이 원본을 보여 준다
    const text = await summarizeWithGemini(
      {
        orgName: l.sos_orgs?.name ?? "수요기관",
        title: l.title,
        stageLabel: STAGE_LABEL[l.stage],
        keywords: keywordIds.map((id) => terms.get(id)).filter((t): t is string => !!t),
        products: await productNames(admin, teamId, keywordIds),
        signalTitles: [],
      },
      { apiKey },
    );
    calls++;
    if (text) {
      // 같은 문장이면 쓰지 않는다 (updated_at)
      if (text !== l.summary || l.summary_source !== "ai") {
        must("AI 요약 저장", await admin.from("sos_leads").update({ summary: text, summary_source: "ai" }).eq("team_id", teamId).eq("id", l.id));
      }
      ai++;
    } else fallback++;
  }

  const next = offset + AI_PER_STEP;
  return {
    cursor: next < ids.length ? continueWith(ctx.cursor, { kind: "summarize", aiOffset: next }) : ctx.cursor,
    stats: { ...ctx.stats, summary: { ...prev, ai, aiFallback: fallback, aiCalls: calls } },
  };
}

/** 키워드 id → 표기 (지워진 키워드도 이름은 보여 준다) */
async function keywordTerms(admin: Admin, teamId: string): Promise<Map<string, string>> {
  const rows = must<{ id: string; term: string }[]>("키워드 이름 조회", await admin.from("sos_keywords").select("id, term").eq("team_id", teamId));
  return new Map((rows ?? []).map((k) => [k.id, k.term]));
}

async function productNames(admin: Admin, teamId: string, keywordIds: string[]): Promise<string[]> {
  if (keywordIds.length === 0) return [];
  const rows = must<{ sos_products: { name: string } | null }[]>(
    "제품 조회",
    await admin
      .from("sos_keyword_products")
      .select("sos_products!inner(name, team_id)")
      .in("keyword_id", keywordIds)
      .eq("sos_products.team_id", teamId),
  );
  return [...new Set((rows ?? []).map((r) => r.sos_products?.name).filter((n): n is string => !!n))];
}
