// 실행 기록 화면 표시 도우미 (순수 — I/O 없음)
import { runProgress, sourceLines, type RunProgress, type SourceLine } from "../run/progress";
import { parseCursor } from "../run/steps";
import { isUuid } from "./ids";

export type RunMode = "collect" | "reanalyze";
export type RunStatusView = "running" | "done" | "partial" | "failed";

// 색만으로 전하지 않게 항상 글자와 함께 쓴다
export const RUN_STATUS_VIEW: Record<RunStatusView, { text: string; color: string }> = {
  running: { text: "진행 중", color: "text-[var(--sos-accent)]" },
  done: { text: "완료", color: "text-[var(--sos-green)]" },
  partial: { text: "일부 실패", color: "text-[var(--sos-yellow)]" },
  failed: { text: "실패", color: "text-[var(--sos-red)]" },
};

export const RUN_MODE_LABEL: Record<RunMode, string> = { collect: "수집", reanalyze: "재분석" };

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** stats → 새·갱신 리드 수와 출처별 결과. 재분석은 원본을 받지 않으므로 출처 줄이 없다 */
export function runView(stats: Record<string, unknown> | null, mode: RunMode): { created: number; updated: number; sources: SourceLine[] } {
  const s = stats ?? {};
  const analyze = (typeof s.analyze === "object" && s.analyze !== null ? s.analyze : {}) as Record<string, unknown>;
  // 끝난 실행에서 기록이 없는 업무는 "대기"가 아니라 받지 않은 것
  const sources =
    mode === "reanalyze"
      ? []
      : sourceLines(s, "").map((l) => (l.state === "waiting" ? { ...l, text: "받지 않음" } : l));
  return { created: count(analyze.created), updated: count(analyze.updated), sources };
}

/** 주소의 실행 id — uuid 만, 소문자로 */
export function parseRunId(v: unknown): string | null {
  return isUuid(v) ? v.toLowerCase() : null;
}

const KST_WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 화면 표시용 서울 시각 ("2026. 10. 22. 09:30") — 서버에서 만들어 넘긴다 */
export function formatKst(iso: string): string {
  return KST_WHEN.format(new Date(iso));
}

/** 진행 중 실행 — 이어 가는 화면이 첫 단계 응답 전에도 지금까지의 진행·출처 줄을 그리게 함께 넘긴다 */
export type RunningRun = { id: string; mode: RunMode; stats: Record<string, unknown>; progress: RunProgress };

export function toRunningRun(row: { id: string; mode: RunMode; stats: Record<string, unknown> | null; cursor: unknown }): RunningRun {
  return { id: row.id, mode: row.mode, stats: row.stats ?? {}, progress: runProgress(true, parseCursor(row.cursor)) };
}
