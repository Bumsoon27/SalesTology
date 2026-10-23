import "server-only";

import { createAdminClient } from "@/shared/supabase/admin";
import { todayInSeoul } from "../lib/date";
import {
  advance,
  currentStep,
  finalStatus,
  isBusy,
  isStale,
  parseCursor,
  planRun,
  recordAttempt,
  releaseAfterError,
  runRange,
  stepLabel,
  tooManyAttempts,
  withLease,
  withoutStepError,
  type RunCursor,
  type RunMode,
  type RunStep,
} from "../run/steps";
import { loadSettings, must, type Admin } from "./db";
import { sosEnv } from "./env";
import type { RunRow, RunStatus } from "./rows";
import { analyzeSaveStep } from "./run-steps/analyze-save";
import { analyzeScanStep } from "./run-steps/analyze-scan";
import { fetchStep } from "./run-steps/fetch";
import { finishStep } from "./run-steps/finish";
import { linkStep } from "./run-steps/link";
import { purgeStep } from "./run-steps/purge";
import { summarizeStep } from "./run-steps/summarize";
import type { StepContext, StepResult } from "./run-steps/types";

// 실행 생명주기: 시작(잠금) → 단계 하나씩 진행(heartbeat) → 마무리.
// teamId 는 호출하는 서버 액션이 requireSosTeam 으로 확인한 값만 받는다. 모든 쿼리에 team_id 조건을 건다.

export type StartRunResult = { ok: true; runId: string } | { ok: false; error: string };
export type AdvanceRunResult = {
  done: boolean;
  status: RunStatus;
  progress: { index: number; total: number; label: string };
  stats: Record<string, unknown>;
  error?: string;
};

const BUSY = "이미 수집이 진행 중입니다.";
const REANALYZE_DAYS = 14;
const RUN_COLUMNS = "id, team_id, mode, status, range_from, range_to, cursor, stats, started_at, heartbeat_at, finished_at";

export async function startRunFor(teamId: string, userId: string, mode: RunMode): Promise<StartRunResult> {
  const admin = createAdminClient();
  const now = new Date();
  try {
    // 진행 중인 실행이 15분 넘게 멈춰 있으면 실패로 돌리고 잠금을 푼다
    const running = must<{ id: string; heartbeat_at: string } | null>(
      "진행 중 실행 조회",
      await admin.from("sos_runs").select("id, heartbeat_at").eq("team_id", teamId).eq("status", "running").maybeSingle(),
    );
    if (running) {
      if (!isStale(running.heartbeat_at, now)) return { ok: false, error: BUSY };
      must(
        "멈춘 실행 정리",
        await admin
          .from("sos_runs")
          .update({ status: "failed", finished_at: now.toISOString() })
          .eq("team_id", teamId)
          .eq("id", running.id)
          .eq("status", "running"),
      );
    }

    if (mode === "collect") {
      try {
        sosEnv();
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "설정 오류" };
      }
    }

    const range = mode === "collect" ? await collectRange(admin, teamId, now) : runRange(null, now, REANALYZE_DAYS);
    const cursor: RunCursor = {
      steps: planRun(mode),
      index: 0,
      totals: {},
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      lease: null,
    };
    const { data, error } = await admin
      .from("sos_runs")
      .insert({
        team_id: teamId,
        started_by: userId,
        mode,
        status: "running",
        range_from: todayInSeoul(range.from),
        range_to: todayInSeoul(range.to),
        cursor,
        stats: {},
        heartbeat_at: now.toISOString(),
      })
      .select("id")
      .single();
    // 부분 유일 인덱스(부문당 running 1개) 위반 = 동시에 눌렀다
    if (error?.code === "23505") return { ok: false, error: BUSY };
    const row = must<{ id: string }>("실행 생성", { data, error });
    return { ok: true, runId: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "수집을 시작하지 못했습니다." };
  }
}

/** 지난 정상 실행의 시작 시각 이후 (첫 실행은 부문 설정 first_run_days) */
async function collectRange(admin: Admin, teamId: string, now: Date) {
  const settings = await loadSettings(admin, teamId);
  const last = must<{ started_at: string } | null>(
    "지난 실행 조회",
    await admin
      .from("sos_runs")
      .select("started_at")
      .eq("team_id", teamId)
      .eq("mode", "collect")
      .eq("status", "done")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  return runRange(last?.started_at ?? null, now, settings.firstRunDays);
}

export async function advanceRunFor(teamId: string, runId: string): Promise<AdvanceRunResult> {
  const admin = createAdminClient();
  const now = new Date();
  try {
    const run = must<RunRow | null>(
      "실행 조회",
      await admin.from("sos_runs").select(RUN_COLUMNS).eq("id", runId).eq("team_id", teamId).maybeSingle(),
    );
    // 다른 부문 실행이거나 없는 실행 — 존재 여부를 구분해 알려 주지 않는다
    if (!run) return rejected("실행을 찾을 수 없습니다.");

    const cursor = parseCursor(run.cursor);
    if (run.status !== "running") return snapshot(run.status, cursor, run.stats);
    if (!cursor) return await fail(admin, run, run.stats, "실행 정보가 손상되었습니다.");
    if (isStale(run.heartbeat_at, now)) return await fail(admin, run, run.stats, "15분 넘게 진행이 없어 중단되었습니다.");
    // 다른 탭이 지금 이 단계를 처리 중
    if (isBusy(cursor, now)) return snapshot("running", cursor, run.stats);

    // 시간 제한으로 죽거나 오류가 난 단계는 다시 불린다 — 같은 단계 3번이면 중단
    const attempted = recordAttempt(cursor);
    if (tooManyAttempts(attempted)) {
      const label = stepLabel(currentStep(cursor));
      const last = stepErrorOf(run.stats);
      const reason = last ? `오류 반복 (${last})` : "시간 초과 반복";
      return await fail(admin, run, run.stats, `${label}: ${reason}`, { step: label, reason });
    }

    // 단계 선점: 읽은 heartbeat 가 그대로일 때만 lease 를 건다 (동시 호출 중 하나만 진행)
    const claimedAt = now.toISOString();
    const claimedCursor = withLease(attempted, now);
    const claimed = must<{ id: string }[]>(
      "단계 선점",
      await admin
        .from("sos_runs")
        .update({ cursor: claimedCursor, heartbeat_at: claimedAt })
        .eq("id", run.id)
        .eq("team_id", teamId)
        .eq("status", "running")
        .eq("heartbeat_at", run.heartbeat_at)
        .select("id"),
    );
    if (!claimed || claimed.length === 0) return snapshot("running", cursor, run.stats);

    const step = currentStep(cursor);
    const ctx: StepContext = { admin, run, teamId, cursor: claimedCursor, stats: run.stats ?? {}, now };
    let result: StepResult;
    try {
      result = step ? await runStep(ctx, step) : { cursor: claimedCursor, stats: ctx.stats, status: finalStatus(ctx.stats) };
    } catch (e) {
      // 일시 오류일 수 있으니 바로 실패시키지 않는다: lease 만 풀고 시도 횟수(recordAttempt)로 3번째에 중단
      return await releaseStep(admin, run, claimedAt, claimedCursor, ctx.stats, step, e);
    }

    const next: RunCursor = { ...advance(result.cursor), lease: null };
    result = { ...result, stats: withoutStepError(result.stats) };
    const status: RunStatus = result.status ?? "running";
    const finished = status !== "running";
    // 선점한 heartbeat 가 그대로일 때만 저장 — lease 가 끝나 다른 요청이 넘겨받았으면 덮어쓰지 않는다
    const saved = must<{ id: string }[]>(
      "진행 저장",
      await admin
        .from("sos_runs")
        .update({
          cursor: next,
          stats: result.stats,
          status,
          heartbeat_at: new Date().toISOString(),
          finished_at: finished ? new Date().toISOString() : null,
        })
        .eq("id", run.id)
        .eq("team_id", teamId)
        .eq("status", "running")
        .eq("heartbeat_at", claimedAt)
        .select("id"),
    );
    if (!saved || saved.length === 0) return await currentState(admin, teamId, run.id);
    return snapshot(status, next, result.stats);
  } catch (e) {
    return rejected(e instanceof Error ? e.message : "진행하지 못했습니다.");
  }
}

function runStep(ctx: StepContext, step: RunStep): Promise<StepResult> {
  switch (step.kind) {
    case "purge":
      return purgeStep(ctx);
    case "fetch":
      return fetchStep(ctx, step.op, step.page);
    case "link":
      return linkStep(ctx, step.after);
    case "analyze":
      return step.save ? analyzeSaveStep(ctx, step.offset) : analyzeScanStep(ctx, step.after);
    case "summarize":
      return summarizeStep(ctx, step.aiOffset);
    case "finish":
      return finishStep(ctx);
  }
}

/** 단계 예외: 서버 로그엔 코드·메시지만, 실행은 running 으로 두고 lease 를 푼다 */
async function releaseStep(
  admin: Admin,
  run: RunRow,
  claimedAt: string,
  claimedCursor: RunCursor,
  stats: Record<string, unknown>,
  step: RunStep | null,
  e: unknown,
): Promise<AdvanceRunResult> {
  const label = stepLabel(step);
  const message = e instanceof Error ? e.message : "단계 처리 중 오류";
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : undefined;
  console.error("[sos] 단계 오류", { run: run.id, step: label, code, message });
  const cursor = releaseAfterError(claimedCursor);
  const nextStats = { ...stats, stepError: { step: label, message } };
  // 선점한 heartbeat 가 그대로일 때만 — 다른 요청이 넘겨받았으면 그쪽 상태를 둔다
  await admin
    .from("sos_runs")
    .update({ cursor, stats: nextStats, heartbeat_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("team_id", run.team_id)
    .eq("status", "running")
    .eq("heartbeat_at", claimedAt);
  return snapshot("running", cursor, nextStats);
}

function stepErrorOf(stats: Record<string, unknown> | null): string | null {
  const v = stats?.stepError;
  return v && typeof v === "object" && "message" in v ? String((v as { message: unknown }).message) : null;
}

async function fail(
  admin: Admin,
  run: RunRow,
  stats: Record<string, unknown>,
  message: string,
  detail?: Record<string, unknown>,
): Promise<AdvanceRunResult> {
  const nextStats = { ...stats, error: detail ?? message };
  const cursor = parseCursor(run.cursor);
  await admin
    .from("sos_runs")
    .update({
      status: "failed",
      stats: nextStats,
      cursor: cursor ? { ...cursor, lease: null } : run.cursor,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("team_id", run.team_id)
    .eq("status", "running");
  return { ...snapshot("failed", cursor, nextStats), error: message };
}

/** 다른 요청이 진행을 넘겨받았을 때 — 지금 DB 상태를 그대로 보여 준다 */
async function currentState(admin: Admin, teamId: string, runId: string): Promise<AdvanceRunResult> {
  const row = must<Pick<RunRow, "status" | "cursor" | "stats"> | null>(
    "실행 조회",
    await admin.from("sos_runs").select("status, cursor, stats").eq("id", runId).eq("team_id", teamId).maybeSingle(),
  );
  if (!row) return rejected("실행을 찾을 수 없습니다.");
  return snapshot(row.status, parseCursor(row.cursor), row.stats);
}

function snapshot(status: RunStatus, cursor: RunCursor | null, stats: Record<string, unknown>): AdvanceRunResult {
  const index = cursor ? Math.min(cursor.index, cursor.steps.length) : 0;
  return {
    done: status !== "running",
    status,
    progress: {
      index,
      total: cursor?.steps.length ?? 0,
      label: status === "running" && cursor ? stepLabel(currentStep(cursor)) : "완료",
    },
    stats: stats ?? {},
  };
}

function rejected(error: string): AdvanceRunResult {
  return { done: true, status: "failed", progress: { index: 0, total: 0, label: "" }, stats: {}, error };
}
