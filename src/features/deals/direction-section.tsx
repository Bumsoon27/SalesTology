"use client";

// 상세 패널 'AI 디렉션' — 이 사업에서 다음에 할 일 (direction.ts, 규칙 기반·외부 전송 없음)
// 갱신 제안에는 바로 실행 버튼(갱신 사업 만들기)이 붙는다
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DealDetail } from "./detail";
import { suggestDirections, type DirectionKind } from "./direction";
import { createRenewalDeal } from "./mutations";

export const DIRECTION_TONE: Record<DirectionKind, string> = {
  issue: "bg-st-red",
  overdue: "bg-st-red",
  due_soon: "bg-st-yellow",
  missing_schedule: "bg-st-yellow",
  stale: "bg-st-yellow",
  single_thread: "bg-st-yellow",
  renewal: "bg-accent",
  margin: "bg-st-yellow",
  data: "bg-accent",
  stage: "bg-accent",
};

export function DirectionSection({ d }: { d: DealDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const items = suggestDirections(
    {
      stage: d.stage,
      status: d.status,
      amount: d.amount,
      gp: d.gp,
      last_activity_at: d.lastActivityAt,
      deal_tasks: d.tasks,
      issues: d.issues,
      deal_notes: d.notes.map((n) => ({ occurred_on: n.occurredOn, counterpart: n.counterpart })),
      period_end: d.periodEnd,
      renewal_exists: !!d.renewalDealId,
    },
    d.today,
    3,
    d.staleAfterDays,
  );
  if (items.length === 0 && !d.renewalDealId) return null;

  const renew = () =>
    start(async () => {
      const r = await createRenewalDeal(d.id);
      if (!r.ok) return setError(r.error);
      setError(null);
      if (r.dealId) router.push(`/dashboard?focus=d:${r.dealId}`);
    });

  return (
    <section className="mx-5 mb-4 rounded-xl border border-accent/25 bg-accent/[0.06] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-accent">
          <span aria-hidden>✦</span> AI 디렉션 · 다음 할 일
        </h3>
        <span className="text-[10px] text-muted" title="사업의 단계·업무·이슈·활동·금액으로 계산합니다. 데이터는 외부로 보내지 않습니다.">
          규칙 기반
        </span>
      </div>
      <ol className="space-y-2">
        {items.map((x, i) => (
          <li key={`${x.kind}-${i}`} className="flex gap-2">
            <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DIRECTION_TONE[x.kind]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{x.title}</p>
              <p className="text-[11px] leading-snug text-muted">{x.why}</p>
              {x.kind === "renewal" && (
                <button
                  type="button"
                  onClick={renew}
                  disabled={pending}
                  className="mt-1.5 rounded-md bg-accent/20 px-2.5 py-1 text-[11px] font-medium text-fg ring-1 ring-accent/40 hover:bg-accent/30 disabled:opacity-50"
                >
                  {pending ? "만드는 중…" : "갱신 사업 만들기 (같은 고객·조건, 다음 1년)"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {d.renewalDealId && (
        <Link href={`/dashboard?focus=d:${d.renewalDealId}`} className="mt-2 inline-block text-[11px] text-accent hover:underline">
          → 이 사업의 갱신 사업 보기
        </Link>
      )}
      {error && <p className="mt-2 text-[11px] text-st-red">{error}</p>}
    </section>
  );
}
