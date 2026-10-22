"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { progressRatio, sourceLines, type SourceLineState } from "../run/progress";
import { advanceRun, startRun } from "../server/actions";

// [수집 시작]·[재분석] — 실행을 만들고 끝날 때까지 단계를 하나씩 진행한다. 탭을 다시 열면 진행 중 실행을 이어 간다.
type Progress = { index: number; total: number; label: string };

// 다른 탭이 같은 단계를 처리 중이면 같은 진행이 돌아온다 — 잠깐 쉬었다 다시 묻는다
const WAIT_MS = 2000;
const STATE_COLOR: Record<SourceLineState, string> = {
  waiting: "text-[var(--sos-text-hint)]",
  active: "text-[var(--sos-accent)]",
  done: "text-[var(--sos-text-sub)]",
  failed: "text-[var(--sos-red)]",
};

// 재분석은 보조 버튼 모양(시각 설계서 §5.1)이고 원본을 받지 않으므로 출처 줄이 없다
const TEXT = {
  collect: { idle: "수집 시작", busy: "수집 중…", done: "수집을 마쳤습니다.", failed: "수집이 실패했습니다.", startFail: "수집을 시작하지 못했습니다. 잠시 뒤 다시 눌러 주세요." },
  reanalyze: { idle: "재분석", busy: "실행 중…", done: "재분석을 마쳤습니다.", failed: "재분석이 실패했습니다.", startFail: "재분석을 시작하지 못했습니다. 잠시 뒤 다시 눌러 주세요." },
};
const BUTTON = {
  collect:
    "h-10 rounded-[6px] bg-[var(--sos-text-strong)] px-4 text-sm font-semibold text-[var(--sos-text-on-primary)] transition-colors duration-200 disabled:cursor-not-allowed disabled:bg-[var(--sos-disabled)]",
  reanalyze:
    "relative h-8 rounded-[6px] border border-[var(--sos-divider)] px-3 text-sm text-[var(--sos-text)] transition-colors duration-200 before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[''] hover:text-[var(--sos-accent)] disabled:cursor-not-allowed disabled:text-[var(--sos-disabled)] disabled:hover:text-[var(--sos-disabled)]",
};

export function RunButton({
  team,
  runningRunId,
  mode = "collect",
}: {
  team: string | null;
  runningRunId: string | null;
  mode?: "collect" | "reanalyze";
}) {
  const text = TEXT[mode];
  const router = useRouter();
  // 진행 중 실행을 이어 갈 때는 처음부터 "수집 중"으로 그린다
  const [running, setRunning] = useState(runningRunId !== null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<{ tone: "error" | "warn" | "ok"; text: string } | null>(null);
  // 화면을 떠나면 반복을 멈춘다 (실행은 서버에 남아 다음 진입 때 이어진다)
  const alive = useRef(true);
  const looping = useRef(false);

  // 단계 반복 — 호출 전에 looping 을 잡아 둔 상태여야 한다 (한 화면에 반복은 하나만)
  const runLoop = useCallback(
    async (runId: string) => {
      setRunning(true);
      setMessage(null);
      let last = -1;
      try {
        while (alive.current) {
          const r = await advanceRun(runId, team);
          if (!alive.current) return;
          setProgress(r.progress);
          setStats(r.stats ?? {});
          if (r.error) {
            setMessage({ tone: "error", text: r.error });
            break;
          }
          if (r.done) {
            if (r.status === "failed") setMessage({ tone: "error", text: text.failed });
            else if (r.status === "partial") setMessage({ tone: "warn", text: "일부 출처를 받지 못했습니다. 나머지 결과는 저장되었습니다." });
            else setMessage({ tone: "ok", text: text.done });
            break;
          }
          if (r.progress.index === last) await new Promise((res) => setTimeout(res, WAIT_MS));
          last = r.progress.index;
        }
      } catch {
        // 오류 객체는 화면에 그대로 보여 주지 않는다
        if (alive.current) setMessage({ tone: "error", text: "서버와 연결이 끊겼습니다. 잠시 뒤 다시 눌러 주세요." });
      } finally {
        looping.current = false;
        if (alive.current) {
          setRunning(false);
          router.refresh();
        }
      }
    },
    [router, team, text],
  );

  // 진행 중 실행이 있으면 (처음 들어올 때든 새로 그린 뒤든) 이어서 진행. 이미 반복 중이면 무시
  useEffect(() => {
    alive.current = true;
    // 렌더가 끝난 뒤 시작 (개발 모드의 effect 두 번 실행도 타이머 취소로 한 번만)
    const t = runningRunId
      ? setTimeout(() => {
          if (looping.current) return;
          looping.current = true;
          void runLoop(runningRunId);
        }, 0)
      : undefined;
    return () => {
      alive.current = false;
      clearTimeout(t);
    };
  }, [runningRunId, runLoop]);

  async function onStart() {
    // 상태값은 다음 렌더에야 바뀌므로 ref 로 바로 막는다 (두 번 눌러 내 실행에 "진행 중" 거절이 뜨지 않게)
    if (looping.current) return;
    looping.current = true;
    setRunning(true);
    setMessage(null);
    setProgress(null);
    setStats({});
    let runId: string | null = null;
    try {
      const r = await startRun(mode, team);
      if (r.ok) runId = r.runId;
      else {
        setMessage({ tone: "error", text: r.error });
        // 다른 사람이 진행 중이면 새로 그려서 그 실행을 이어 보여 준다
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: text.startFail });
    }
    if (runId) {
      await runLoop(runId);
      return;
    }
    looping.current = false;
    setRunning(false);
  }

  const ratio = progress ? progressRatio(progress) : 0;
  const lines = mode === "collect" && (running || progress) ? sourceLines(stats, progress?.label ?? "") : [];

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[320px]">
      <button
        type="button"
        onClick={onStart}
        disabled={running}
        className={BUTTON[mode]}
      >
        {running ? text.busy : text.idle}
      </button>

      {(running || progress) && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            aria-label={mode === "collect" ? "수집 진행" : "재분석 진행"}
            className="h-[2px] w-full bg-[var(--sos-divider-lite)]"
          >
            <div
              className="h-full bg-[var(--sos-accent)] shadow-[0_0_10px_var(--sos-accent),0_0_5px_var(--sos-accent)] transition-[width] duration-200"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          {progress && (
            <p className="sos-num text-xs font-medium text-[var(--sos-text-sub)]">
              {progress.label} ({Math.min(progress.index, progress.total)}/{progress.total})
            </p>
          )}
          <ul className="flex flex-col gap-0.5 text-xs">
            {lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-4">
                <span className="text-[var(--sos-text-sub)]">{l.label}</span>
                <span className={`sos-num ${STATE_COLOR[l.state]}`}>{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`text-xs font-medium ${
            message.tone === "error"
              ? "text-[var(--sos-red)]"
              : message.tone === "warn"
                ? "text-[var(--sos-yellow)]"
                : "text-[var(--sos-green)]"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
