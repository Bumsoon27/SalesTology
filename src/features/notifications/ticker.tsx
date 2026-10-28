"use client";

// 상단 뉴스 티커 (설계서 §7.2): 5초마다 위로 슬라이드, 긴급도 가중 무작위, 호버 시 멈춤, 클릭 시 해당 사업으로 이동
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pickNext, type AppNotification } from "./build";

export const DOT: Record<AppNotification["kind"], string> = {
  issue: "bg-st-red shadow-[0_0_8px_var(--st-red)]",
  task_overdue: "bg-st-red shadow-[0_0_8px_var(--st-red)]",
  missing_schedule: "bg-st-yellow shadow-[0_0_8px_var(--st-yellow)]",
  task_soon: "bg-st-yellow shadow-[0_0_8px_var(--st-yellow)]",
  renewal_soon: "bg-accent shadow-[0_0_8px_var(--accent)]",
  external: "bg-st-green shadow-[0_0_8px_var(--st-green)]",
};

export function Ticker({ items }: { items: AppNotification[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState<AppNotification | null>(items[0] ?? null);
  const [tick, setTick] = useState(0);
  const paused = useRef(false);
  const recent = useRef<string[]>(items[0] ? [items[0].key] : []);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => {
      if (paused.current) return;
      const next = pickNext(items, recent.current);
      if (!next) return;
      recent.current = [...recent.current, next.key].slice(-3);
      setCurrent(next);
      setTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [items]);

  if (!current) {
    return <span className="truncate text-xs text-muted">✅ 모든 사업이 순조롭습니다</span>;
  }

  return (
    <button
      type="button"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onClick={() => router.push(current.href)}
      className="group flex h-7 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-full border border-line bg-surface/60 px-3 text-xs hover:border-accent/40"
      title="눌러서 자세히 보기"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[current.kind]}`} />
      {current.source && <span className="shrink-0 rounded bg-white/10 px-1.5 text-[10px] text-fg">{current.source}</span>}
      <span key={tick} className="animate-[ticker-in_0.45s_ease-out] truncate text-fg/90 group-hover:text-fg">
        {current.text}
      </span>
      {items.length > 1 && <span className="shrink-0 text-muted">{items.length}</span>}
    </button>
  );
}
