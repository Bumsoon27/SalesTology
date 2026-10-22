// 수집 진행 화면용 계산 — 순수 함수 (실행 stats → 출처별 상태 줄)
import { G2B_OPS } from "../collectors/g2b";
import { opDisplayName, opLabel } from "./steps";

export type SourceLineState = "waiting" | "active" | "done" | "failed";
export type SourceLine = { key: string; label: string; state: SourceLineState; text: string };

type OpStats = { fetched?: number; matched?: number; skipped?: boolean; error?: unknown };

/** 업무(출처×물품/용역)마다 대기·진행·완료 n건·실패 사유. currentLabel 은 advanceRun 의 progress.label */
export function sourceLines(stats: Record<string, unknown>, currentLabel: string): SourceLine[] {
  return G2B_OPS.map((op) => {
    const key = opLabel(op);
    const label = opDisplayName(op);
    const st = (stats[key] ?? null) as OpStats | null;
    const active = currentLabel.startsWith(`${label} `);
    const counts = st ? `${st.fetched ?? 0}건 · 일치 ${st.matched ?? 0}` : "";
    if (st && st.error) return { key, label, state: "failed", text: `실패: ${String(st.error)}` };
    if (active) return { key, label, state: "active", text: st ? `진행 ${counts}` : "진행" };
    if (!st) return { key, label, state: "waiting", text: "대기" };
    if (st.skipped) return { key, label, state: "done", text: "이미 받은 자료 재사용" };
    return { key, label, state: "done", text: `완료 ${counts}` };
  });
}

/** 진행 막대 길이 (0~1) */
export function progressRatio(p: { index: number; total: number }): number {
  if (!p.total) return 0;
  return Math.min(1, Math.max(0, p.index / p.total));
}
