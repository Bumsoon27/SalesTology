"use server";

import { requireSosTeam } from "./context";
import { advanceRunFor, startRunFor, type AdvanceRunResult, type StartRunResult } from "./run";

// 서버 액션은 누구나 POST 할 수 있는 입구다. 부문은 requireSosTeam 으로만 정하고, 요청값은 검증에만 쓴다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** [수집 시작]·[재분석]. 같은 부문에 진행 중인 실행이 있으면 거절한다 */
export async function startRun(mode: "collect" | "reanalyze", team?: string | null): Promise<StartRunResult> {
  if (mode !== "collect" && mode !== "reanalyze") return { ok: false, error: "잘못된 요청입니다." };
  const { user, teamId } = await requireSosTeam(typeof team === "string" ? team : null);
  return startRunFor(teamId, user.id, mode);
}

/** 화면이 반복 호출 — 현재 단계 하나만 처리한다. 다른 부문의 실행이면 거절 */
export async function advanceRun(runId: string, team?: string | null): Promise<AdvanceRunResult> {
  const { teamId } = await requireSosTeam(typeof team === "string" ? team : null);
  if (typeof runId !== "string" || !UUID.test(runId)) {
    return { done: true, status: "failed", progress: { index: 0, total: 0, label: "" }, stats: {}, error: "잘못된 요청입니다." };
  }
  return advanceRunFor(teamId, runId);
}
