"use client";

// 파이프라인 보드 — 단계 열에 카드를 끌어 옮기면 단계가 바뀐다 (Pipedrive 참고).
// 휴대폰·키보드는 카드의 '단계' 선택으로 옮긴다. 동시 수정은 updated_at 비교로 막는다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveError, type BoardCard, type BoardColumn } from "./board";
import { updateDeal } from "./mutations";
import { STAGE_LABEL, type DealStage } from "./types";

const DOT: Record<BoardCard["status"], string> = {
  red: "bg-st-red",
  yellow: "bg-st-yellow",
  green: "bg-st-green",
  grey: "bg-st-grey",
  hold: "bg-st-grey",
};

function eok(n: number) {
  if (n === 0) return "0";
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export function PipelineBoard({ columns: initial }: { columns: BoardColumn[] }) {
  const router = useRouter();
  const [columns, setColumns] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const find = (id: string) => columns.flatMap((c) => c.cards).find((c) => c.id === id) ?? null;

  const move = (id: string, to: DealStage) => {
    const card = find(id);
    if (!card || card.stage === to) return;
    const why = moveError(card, to);
    if (why) return setError(why);
    // 먼저 화면에서 옮기고(즉시 반응), 실패하면 되돌린다
    const before = columns;
    setColumns((cols) =>
      cols.map((c) =>
        c.stage === card.stage ? { ...c, cards: c.cards.filter((x) => x.id !== id) } : c.stage === to ? { ...c, cards: [{ ...card, stage: to }, ...c.cards] } : c,
      ),
    );
    setError(null);
    start(async () => {
      const r = await updateDeal(id, { stage: to }, card.updatedAt);
      if (!r.ok) {
        setColumns(before);
        setError(r.error);
      }
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error && <p className="mx-4 rounded-lg border border-st-red/40 bg-st-red/10 px-3 py-2 text-xs text-st-red sm:mx-6">{error}</p>}
      <div className={`flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto px-4 pb-4 sm:px-6 ${pending ? "cursor-progress" : ""}`}>
        {columns.map((col) => {
          const blocked = dragId ? moveError(find(dragId) ?? { stage: col.stage, contractType: "competitive" }, col.stage) : null;
          return (
            <section
              key={col.stage}
              aria-label={`${col.label} 단계`}
              onDragOver={(e) => {
                if (!dragId || blocked) return;
                e.preventDefault();
                setOverStage(col.stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === col.stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOverStage(null);
                setDragId(null);
                if (id) move(id, col.stage);
              }}
              className={`flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl border bg-surface/60 transition-colors sm:w-[260px] ${
                overStage === col.stage ? "border-accent/60 bg-accent/[0.06]" : blocked ? "border-line opacity-40" : "border-line"
              }`}
            >
              <header className="border-b border-line px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    {col.label} <span className="text-xs font-normal text-muted">{col.cards.length}</span>
                  </h2>
                  <span className="text-[10px] text-muted">{col.probability}%</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {eok(col.total)} · 가중 <span className="text-fg">{eok(col.weighted)}</span>
                </p>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
                {col.cards.map((c) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(c.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    className={`group rounded-xl border border-line bg-bg/70 p-3 text-xs shadow-sm transition hover:border-accent/40 ${dragId === c.id ? "opacity-40" : ""} ${c.onHold ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[c.status]}`} />
                      <Link href={`/dashboard?focus=d:${c.id}`} className="min-w-0 flex-1 font-medium leading-snug hover:underline" title={c.name}>
                        <span className="line-clamp-2">{c.name}</span>
                      </Link>
                    </div>
                    <p className="mt-1 truncate pl-4 text-[11px] text-muted">
                      {c.customer}
                      {c.onHold && " · 보류"}
                    </p>
                    <div className="mt-2 flex items-center justify-between pl-4 tabular-nums">
                      <span className="font-semibold">{c.amount == null ? "규모 미입력" : eok(c.amount)}</span>
                      <span className="text-[11px] text-muted">
                        {c.gpRate != null && `GP ${c.gpRate}% · `}
                        {c.idleDays === 0 ? "오늘" : `${c.idleDays}일 전`}
                      </span>
                    </div>
                    {(c.reason || c.next) && (
                      <p className="mt-2 border-t border-line pt-2 pl-4 text-[11px] leading-snug text-muted">
                        {c.reason && c.status !== "green" ? <span className="text-st-yellow">{c.reason}</span> : <span className="text-accent">✦ {c.next}</span>}
                      </p>
                    )}
                    {/* 휴대폰·키보드용 단계 이동 */}
                    <label className="mt-2 flex items-center justify-end gap-1 pl-4 text-[10px] text-muted">
                      단계
                      <select
                        value={c.stage}
                        onChange={(e) => move(c.id, e.target.value as DealStage)}
                        className="rounded border border-line bg-transparent px-1 py-0.5 text-[10px]"
                        aria-label={`${c.name} 단계 변경`}
                      >
                        {columns.map((x) => (
                          <option key={x.stage} value={x.stage} disabled={!!moveError(c, x.stage)}>
                            {STAGE_LABEL[x.stage]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
                {col.cards.length === 0 && <li className="flex flex-1 items-center justify-center py-6 text-[11px] text-muted">비어 있음</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
