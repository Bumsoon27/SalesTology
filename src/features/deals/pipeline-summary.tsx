"use client";

// 대시보드 왼쪽 아래 카드 — [오늘 할 일]: 내 사업 전체의 AI 디렉션(direction.ts) / [파이프라인]: 규모·가중 예상·GP·정체 (pipeline.ts)
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DealDirection } from "./direction";
import { DIRECTION_TONE } from "./direction-section";
import { STAGE_PROBABILITY, STALE_AFTER_DAYS, type PipelineSummary } from "./pipeline";

function eok(n: number) {
  if (n === 0) return "0";
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

type Tab = "todo" | "pipeline";

export function PipelineSummaryCard({ summary: s, directions }: { summary: PipelineSummary; directions: DealDirection[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(directions.length > 0 ? "todo" : "pipeline");
  const max = Math.max(1, ...s.stages.map((x) => x.amount));
  const focus = (dealId: string) => router.push(`/dashboard?focus=d:${dealId}`);
  const urgent = directions.filter((d) => d.priority >= 70).length;

  return (
    <div className="w-[min(340px,calc(100vw-32px))] rounded-2xl border border-line bg-surface/90 text-fg shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-[11px] text-muted">
            <span className="text-accent">✦</span> 오늘 할 일 {directions.length} · 진행 {s.activeCount}건
          </span>
          <span className="text-sm font-semibold">
            예상 {eok(s.weighted)} <span className="font-normal text-muted">/ 전체 {eok(s.total)}</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {urgent > 0 && <span className="rounded-full border border-st-red/40 px-2 py-0.5 text-[10px] text-st-red">급함 {urgent}</span>}
          {s.stale.length > 0 && (
            <span className="rounded-full border border-st-yellow/40 px-2 py-0.5 text-[10px] text-st-yellow">정체 {s.stale.length}</span>
          )}
          <span className={`text-xs text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-line">
          <div role="tablist" aria-label="카드 보기" className="flex gap-1 px-3 pt-2">
            {(
              [
                ["todo", `오늘 할 일 ${directions.length}`],
                ["pipeline", "파이프라인"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  tab === k ? "bg-accent/20 text-fg ring-1 ring-accent/50" : "text-muted hover:bg-white/[0.06] hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[50dvh] space-y-4 overflow-y-auto px-4 py-3">
            {tab === "todo" ? (
              directions.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">급한 일이 없습니다. 사업을 눌러 단계별 다음 할 일을 확인하세요.</p>
              ) : (
                <ul className="space-y-1">
                  {directions.map((x, i) => (
                    <li key={`${x.dealId}-${x.kind}-${i}`}>
                      <button type="button" onClick={() => focus(x.dealId)} className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5">
                        <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DIRECTION_TONE[x.kind]}`} />
                        <span className="min-w-0">
                          <span className="block text-xs leading-snug">{x.title}</span>
                          <span className="block truncate text-[10px] text-muted">
                            {x.dealName} · {x.customer}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["가중 예상", eok(s.weighted)],
                    ["확정(수주 후)", eok(s.committed)],
                    ["GP", s.gpRate == null ? eok(s.gp) : `${eok(s.gp)} · ${s.gpRate}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-white/[0.03] px-1 py-2">
                      <dt className="text-[10px] text-muted">{k}</dt>
                      <dd className="text-xs font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>

                {s.stages.length > 0 && (
                  <ul className="space-y-1.5">
                    {s.stages.map((x) => (
                      <li key={x.stage} className="grid grid-cols-[3.2rem_1fr_3.5rem] items-center gap-2 text-[11px]">
                        <span className="text-muted">
                          {x.label} <span className="text-[9px]">{STAGE_PROBABILITY[x.stage]}%</span>
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                          <span className="block h-full rounded-full bg-accent/70" style={{ width: `${(x.amount / max) * 100}%` }} />
                        </span>
                        <span className="text-right">
                          {eok(x.amount)} <span className="text-muted">({x.count})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {s.stale.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted">{STALE_AFTER_DAYS}일 넘게 활동 없는 사업</p>
                    <ul className="space-y-1">
                      {s.stale.slice(0, 5).map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            onClick={() => focus(d.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-white/5"
                          >
                            <span className="truncate">
                              {d.name} <span className="text-muted">· {d.customer}</span>
                            </span>
                            <span className="shrink-0 text-st-yellow">{d.idleDays}일</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {s.missingAmount > 0 && <p className="text-[10px] text-muted">규모를 넣지 않은 사업 {s.missingAmount}건은 금액에서 빠졌습니다.</p>}
                <p className="text-[10px] text-muted">가중 예상 = 규모 × 단계별 성사 확률</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
