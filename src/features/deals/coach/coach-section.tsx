"use client";

// 영업기회 상세 하단 'AI 코칭' — 진단·영업 방향·이번 주 할 일. 모델에는 익명 신호만 보내고, 보낸 정보를 그대로 보여준다
import { useEffect, useState, useTransition } from "react";
import type { DealDetail } from "../detail";
import { getCoaching, type CoachResult } from "./actions";

function when(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CoachSection({ d }: { d: DealDetail }) {
  const [res, setRes] = useState<CoachResult | null>(null);
  const [showSignals, setShowSignals] = useState(false);
  const [pending, start] = useTransition();
  // 사업 내용이 바뀌면(updatedAt·활동) 지난 결과를 다시 확인한다
  const stamp = `${d.id}|${d.updatedAt}|${d.lastActivityAt}|${d.notes.length}`;

  useEffect(() => {
    let alive = true;
    void getCoaching(d.id, "peek").then((r) => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [stamp, d.id]);

  if (!d.aiCoachEnabled) return null;
  const run = (mode: "generate" | "refresh") => start(async () => setRes(await getCoaching(d.id, mode)));
  const ok = res?.ok ? res : null;
  const advice = ok?.advice ?? null;

  return (
    <section className={`mx-5 my-4 rounded-xl border border-[#a770ff]/30 bg-[#a770ff]/[0.06] p-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[#c9a8ff]">
            <span aria-hidden>✦</span> AI 코칭 · 영업 방향
          </h3>
          <p className="mt-0.5 text-[10px] text-muted">
            {ok?.llmAvailable ? "sLLM" : "규칙 기반"} · 회사·사람 이름과 메모 내용은 보내지 않습니다
          </p>
        </div>
        {advice ? (
          <button
            type="button"
            onClick={() => run("refresh")}
            disabled={pending}
            className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:border-[#a770ff]/50 hover:text-fg disabled:opacity-40"
          >
            {pending ? "생각 중…" : "다시 받기"}
          </button>
        ) : null}
      </div>

      {res && !res.ok && <p className="mt-3 text-xs text-st-red">{res.error}</p>}

      {!advice && (
        <button
          type="button"
          onClick={() => run("generate")}
          disabled={pending || !res?.ok}
          className="mt-3 w-full rounded-lg bg-[#a770ff]/20 px-3 py-2 text-xs font-semibold text-[#e2d2ff] ring-1 ring-[#a770ff]/40 hover:bg-[#a770ff]/30 disabled:opacity-40"
        >
          {pending ? "코칭을 만드는 중…" : !res ? "확인 중…" : "이 사업 코칭 받기"}
        </button>
      )}

      {advice && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="leading-relaxed">{advice.diagnosis}</p>
          <div>
            <p className="mb-1 text-[11px] font-medium text-[#c9a8ff]">영업 방향</p>
            <ul className="space-y-1">
              {advice.strategy.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed">
                  <span aria-hidden className="text-[#a770ff]">›</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-[#c9a8ff]">이번 주 할 일</p>
            <ol className="space-y-1">
              {advice.actions.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed">
                  <span className="text-muted">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-[10px] text-muted">
            {ok?.source === "llm" ? `sLLM (${ok.model})` : "규칙 기반"}
            {ok?.createdAt && ` · ${when(ok.createdAt)}`}
            {ok?.llmAvailable && ` · 오늘 남은 횟수 ${ok.remaining}`}
          </p>
          {ok?.note && <p className="text-[10px] text-st-yellow">{ok.note}</p>}
        </div>
      )}

      {ok && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowSignals((v) => !v)} className="text-[10px] text-muted underline-offset-4 hover:text-fg hover:underline">
            {showSignals ? "보낸 정보 닫기" : "모델에 보내는 정보 보기"}
          </button>
          {showSignals && (
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-2 text-[10px] leading-relaxed text-muted">
              {JSON.stringify(ok.signals, null, 2)}
            </pre>
          )}
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted">코칭은 참고용입니다. 최종 판단은 담당자가 합니다.</p>
    </section>
  );
}
