import type { RunCursor } from "../../run/steps";
import type { Admin } from "../db";
import type { RunRow, RunStatus } from "../rows";

// 단계 함수 공통 입력·출력. teamId 는 requireSosTeam 으로 확인된 run.team_id 뿐이다.
export type StepContext = {
  admin: Admin;
  run: RunRow;
  teamId: string;
  cursor: RunCursor;
  stats: Record<string, unknown>;
  now: Date;
};

// cursor 는 아직 진행(index+1)하지 않은 상태로 돌려준다. status 는 finish 만 정한다.
export type StepResult = {
  cursor: RunCursor;
  stats: Record<string, unknown>;
  status?: RunStatus;
};

/** 실행 시작 시 정한 범위 (없으면 run 의 날짜로 대신) */
export function cursorRange(ctx: StepContext): { from: Date; to: Date } {
  const r = ctx.cursor.range;
  if (r) return { from: new Date(r.from), to: new Date(r.to) };
  return { from: new Date(`${ctx.run.range_from}T00:00:00+09:00`), to: ctx.now };
}
