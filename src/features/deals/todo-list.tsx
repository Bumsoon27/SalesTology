"use client";

// 할 일 목록 — 기한별 묶음, '완료'를 누르면 오늘 날짜로 완료 처리 (권한은 RLS)
import Link from "next/link";
import { useState, useTransition } from "react";
import { completeTask, reopenTask, rescheduleTask } from "./mutations";
import { BUCKET_LABEL, BUCKETS, type Todo, type TodoBucket } from "./todo";

const TONE: Record<TodoBucket, string> = { overdue: "text-st-red", today: "text-st-yellow", week: "text-fg", later: "text-muted", nodate: "text-muted" };
/** YYYY-MM-DD + n일 */
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const mini = "rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-fg disabled:opacity-40";

export function TodoList({ groups, today, showOwner }: { groups: Record<TodoBucket, Todo[]>; today: string; showOwner: boolean }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // 다른 묶음이 없으면 '이후'도 처음부터 펼친다
  const [showLater, setShowLater] = useState(() => BUCKETS.every((b) => b === "later" || groups[b].length === 0));

  const toggle = (t: Todo) =>
    start(async () => {
      const was = done.has(t.taskId);
      const r = was ? await reopenTask(t.taskId) : await completeTask(t.taskId, today);
      if (!r.ok) return setError(r.error);
      setError(null);
      setDone((s) => {
        const n = new Set(s);
        if (was) n.delete(t.taskId);
        else n.add(t.taskId);
        return n;
      });
    });

  // 미루기 — 기한(없으면 오늘)에서 n일 뒤로. 서버 새로고침으로 묶음이 다시 정해진다
  const postpone = (t: Todo, days: number) =>
    start(async () => {
      const base = t.due && t.due > today ? t.due : today;
      const r = await rescheduleTask(t.taskId, addDays(base, days));
      if (!r.ok) return setError(r.error);
      setError(null);
    });

  const total = BUCKETS.reduce((s, b) => s + groups[b].length, 0);
  if (total === 0) return <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">남은 할 일이 없습니다.</div>;

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-st-red">{error}</p>}
      {BUCKETS.map((b) => {
        const list = groups[b];
        if (list.length === 0) return null;
        const folded = b === "later" && !showLater;
        return (
          <section key={b} className="rounded-2xl border border-line bg-surface/60">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className={`text-sm font-semibold ${TONE[b]}`}>
                {BUCKET_LABEL[b]} <span className="text-xs font-normal text-muted">{list.length}</span>
              </h2>
              {b === "later" && (
                <button type="button" className={mini} onClick={() => setShowLater((v) => !v)}>
                  {showLater ? "접기" : "펼치기"}
                </button>
              )}
            </div>
            {!folded && (
              <ul className="divide-y divide-line border-t border-line">
                {list.map((t) => {
                  const isDone = done.has(t.taskId);
                  return (
                    <li key={t.taskId} className={`flex items-center justify-between gap-3 px-4 py-2.5 text-xs transition-opacity ${isDone ? "opacity-45" : ""}`}>
                      <span className="min-w-0">
                        <span className={`block truncate text-sm ${isDone ? "line-through" : ""}`}>{t.title}</span>
                        <Link href={`/dashboard?focus=d:${t.dealId}`} className="text-[11px] text-muted hover:text-accent">
                          {t.dealName} · {t.customer}
                          {showOwner && t.owner && ` · ${t.owner}`}
                        </Link>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`tabular-nums ${TONE[b]}`}>
                          {t.days == null ? "-" : t.days < 0 ? `+${-t.days}일` : t.days === 0 ? "오늘" : `D-${t.days}`}
                          {t.due && <span className="ml-1 text-muted">{t.due.slice(5).replace("-", "/")}</span>}
                        </span>
                        {!isDone && (
                          <>
                            <button type="button" className={`${mini} hidden sm:inline`} disabled={pending} onClick={() => postpone(t, 3)} title="기한을 3일 뒤로">
                              +3일
                            </button>
                            <button type="button" className={`${mini} hidden sm:inline`} disabled={pending} onClick={() => postpone(t, 7)} title="기한을 7일 뒤로">
                              +7일
                            </button>
                          </>
                        )}
                        <button type="button" className={mini} disabled={pending} onClick={() => toggle(t)}>
                          {isDone ? "되돌리기" : "완료"}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
