"use client";

// 대시보드 왼쪽 아래 '파이프라인' 카드 — 규모·가중 예상·GP·단계 분포·정체 사업 (pipeline.ts)
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STAGE_PROBABILITY, STALE_AFTER_DAYS, type PipelineSummary } from "./pipeline";

function eok(n: number) {
  if (n === 0) return "0";
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export function PipelineSummaryCard({ summary: s }: { summary: PipelineSummary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const max = Math.max(1, ...s.stages.map((x) => x.amount));

  return (
    <div className="w-[min(320px,calc(100vw-32px))] rounded-2xl border border-line bg-surface/90 text-fg shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-[11px] text-muted">파이프라인 · 진행 {s.activeCount}건</span>
          <span className="text-sm font-semibold">
            예상 {eok(s.weighted)} <span className="font-normal text-muted">/ 전체 {eok(s.total)}</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {s.stale.length > 0 && (
            <span className="rounded-full border border-st-yellow/40 px-2 py-0.5 text-[10px] text-st-yellow">정체 {s.stale.length}</span>
          )}
          <span className={`text-xs text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-3">
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
                      onClick={() => router.push(`/dashboard?focus=d:${d.id}`)}
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
        </div>
      )}
    </div>
  );
}
