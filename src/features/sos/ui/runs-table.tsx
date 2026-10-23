import Link from "next/link";
import { formatKst, RUN_MODE_LABEL, RUN_STATUS_VIEW, runView } from "../lib/run-view";
import type { RunHistoryItem } from "../server/settings-queries";
import { STATE_COLOR } from "./sos-styles";

// 실행 기록 목록 (설계서 §5.6). 줄을 누르면 그 실행에서 나온 리드를 본다

export function runHref(id: string, team: string | null): string {
  return team ? `/sos/runs/${id}?team=${encodeURIComponent(team)}` : `/sos/runs/${id}`;
}

export function RunSummary({ run }: { run: RunHistoryItem }) {
  const st = RUN_STATUS_VIEW[run.status];
  const v = runView(run.stats, run.mode);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="sos-num text-sm text-[var(--sos-text)]">
        <span className="text-[var(--sos-text-strong)]">{formatKst(run.startedAt)}</span> · {run.starterName ?? "알 수 없음"} · {RUN_MODE_LABEL[run.mode]} ·{" "}
        <span className={st.color}>{st.text}</span>
      </p>
      <p className="sos-num text-xs font-medium text-[var(--sos-text-sub)]">
        새 리드 {v.created} · 갱신 {v.updated}
      </p>
      {/* 진행 중인 실행은 아직 결과가 없다 */}
      {run.status !== "running" && v.sources.length > 0 && (
        <ul className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
          {v.sources.map((l) => (
            <li key={l.key} className="flex justify-between gap-4">
              <span className="text-[var(--sos-text-sub)]">{l.label}</span>
              <span className={`sos-num ${STATE_COLOR[l.state]}`}>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RunsTable({ runs, team }: { runs: RunHistoryItem[]; team: string | null }) {
  if (runs.length === 0) {
    return <p className="py-12 text-center text-sm text-[var(--sos-text-sub)]">아직 수집한 기록이 없습니다. [수집 시작]을 눌러 보세요</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {runs.map((r) => (
        <li key={r.id}>
          <Link
            href={runHref(r.id, team)}
            className="block rounded-[6px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] p-5 transition-colors duration-200 hover:border-[var(--sos-text-hint)]"
          >
            <RunSummary run={r} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
