"use client";

// 상세 패널 '활동 기록' — 통화·미팅·메일·메모를 남기면 사업의 마지막 활동이 갱신된다 (정체·AI 디렉션에 반영)
import { useState, useTransition } from "react";
import type { DealDetail } from "./detail";
import { addDealNote, addTask, deleteDealNote, type MutationResult } from "./mutations";
import { COUNTERPART_MAX, NOTE_KINDS, NOTE_LABEL, NOTE_MAX, type NoteKind } from "./notes";
import { TASK_LABEL, type TaskType } from "./types";

const FOLLOW_TYPES = ["quote_reply_out", "order", "delivery", "inspection", "invoice_out", "custom"] as const satisfies readonly TaskType[];
type FollowType = (typeof FOLLOW_TYPES)[number];

/** YYYY-MM-DD + n일 */
function addDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const mini = "rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-fg";
const KIND_ICON: Record<NoteKind, string> = { call: "☎", meeting: "◎", email: "✉", note: "✎" };

export function NotesSection({ d, onChanged }: { d: DealDetail; onChanged: () => void }) {
  const [kind, setKind] = useState<NoteKind>("call");
  const [body, setBody] = useState("");
  const [counterpart, setCounterpart] = useState("");
  const [on, setOn] = useState(d.today);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // 후속 업무: 기록과 함께 '견적 회신 D+3' 같은 추적 업무를 만든다 (기본 꺼짐)
  const [follow, setFollow] = useState<{ on: boolean; type: FollowType; due: string }>({ on: false, type: "quote_reply_out", due: addDays(d.today, 3) });
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<MutationResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setError(null);
      after?.();
      onChanged();
    });

  const submit = () =>
    startTransition(async () => {
      const r = await addDealNote(d.id, { kind, body, occurredOn: on, counterpart });
      if (!r.ok) return setError(r.error);
      let err: string | null = null;
      if (follow.on) {
        const title = follow.type === "custom" ? `후속: ${body.trim().split("\n")[0].slice(0, 60)}` : undefined;
        const t = await addTask(d.id, { type: follow.type, dueDate: follow.due, title });
        if (!t.ok) err = `기록은 남겼지만 후속 업무를 만들지 못했습니다: ${t.error}`;
      }
      setError(err);
      setBody("");
      setFollow((f) => ({ ...f, on: false, due: addDays(d.today, 3) }));
      onChanged();
    });

  const list = showAll ? d.notes : d.notes.slice(0, 5);

  return (
    <section className={`space-y-2.5 border-t border-line px-5 py-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">활동 기록 {d.notes.length}</h3>
        <span className="text-[10px] text-muted">남기면 &lsquo;정체&rsquo;가 풀립니다</span>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          // 상대는 다음 기록에도 같은 사람일 때가 많아 그대로 둔다
          submit();
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {NOTE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${kind === k ? "border-accent/60 bg-accent/15 text-fg" : "border-line text-muted hover:text-fg"}`}
            >
              {KIND_ICON[k]} {NOTE_LABEL[k]}
            </button>
          ))}
          <input
            type="date"
            value={on}
            max={d.today}
            onChange={(e) => setOn(e.target.value)}
            aria-label="활동 날짜"
            className="field ml-auto w-auto py-0.5 text-[11px]"
          />
        </div>
        <input
          value={counterpart}
          onChange={(e) => setCounterpart(e.target.value)}
          maxLength={COUNTERPART_MAX}
          list={`counterparts-${d.id}`}
          placeholder="누구와 — 고객 쪽 상대 (예: 김과장·전산팀) · 선택"
          aria-label="고객 쪽 상대"
          className="field py-1.5 text-xs"
        />
        <datalist id={`counterparts-${d.id}`}>
          {[...new Set(d.notes.map((n) => n.counterpart).filter((c): c is string => !!c))].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={NOTE_MAX}
          rows={2}
          placeholder="예: 담당 과장 통화 — 예산 3억 확정, 11월 첫째 주 견적 요청"
          className="field resize-y py-1.5 text-xs"
        />
        {/* 후속 업무 — 추적 업무로 등록되어 기한이 다가오면 노란색·티커 알림으로 보인다 */}
        <div className={`rounded-lg border px-2.5 py-2 text-[11px] transition-colors ${follow.on ? "border-accent/40 bg-accent/[0.05]" : "border-line"}`}>
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={follow.on} onChange={(e) => setFollow((f) => ({ ...f, on: e.target.checked }))} className="accent-[var(--accent)]" />
            후속 업무도 만들기
          </label>
          {follow.on && (
            <div className="mt-2 flex animate-[fadeIn_.18s_ease-out] flex-wrap items-center gap-1.5">
              <select
                value={follow.type}
                onChange={(e) => setFollow((f) => ({ ...f, type: e.target.value as FollowType }))}
                aria-label="후속 업무 종류"
                className="rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[11px]"
              >
                {FOLLOW_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-surface">
                    {t === "custom" ? "기타 (내용 첫 줄)" : TASK_LABEL[t]}
                  </option>
                ))}
              </select>
              {[1, 3, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFollow((f) => ({ ...f, due: addDays(d.today, n) }))}
                  className={`rounded-full border px-2 py-0.5 ${follow.due === addDays(d.today, n) ? "border-accent/60 bg-accent/15 text-fg" : "border-line text-muted hover:text-fg"}`}
                >
                  D+{n}
                </button>
              ))}
              <input
                type="date"
                value={follow.due}
                min={d.today}
                onChange={(e) => setFollow((f) => ({ ...f, due: e.target.value }))}
                aria-label="후속 업무 기한"
                className="field ml-auto w-auto py-0.5 text-[11px]"
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted">
            {body.length}/{NOTE_MAX}
          </span>
          <button type="submit" disabled={!body.trim() || pending} className="rounded-md bg-fg px-3 py-1 text-xs font-semibold text-bg disabled:opacity-40">
            기록
          </button>
        </div>
      </form>

      {error && <p className="text-xs text-st-red">{error}</p>}

      {d.notes.length > 0 && (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                <span>
                  {KIND_ICON[n.kind]} {NOTE_LABEL[n.kind]}
                  {n.counterpart && <span className="text-fg"> · {n.counterpart}</span>} · {n.occurredOn} · {n.author ?? "-"}
                </span>
                {n.mine && (
                  <button
                    type="button"
                    className={mini}
                    onClick={() => {
                      if (window.confirm("이 기록을 지울까요?")) run(() => deleteDealNote(n.id));
                    }}
                  >
                    지우기
                  </button>
                )}
              </div>
              {/* 사용자 입력은 텍스트로만 렌더링 (HTML 해석 없음) */}
              <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      {d.notes.length > 5 && (
        <button type="button" className={mini} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "접기" : `${d.notes.length - 5}개 더 보기`}
        </button>
      )}
    </section>
  );
}
