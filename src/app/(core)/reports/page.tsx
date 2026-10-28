import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { getTeamMembers } from "@/features/deals/queries";
import { resolveScope } from "@/features/deals/scope";
import { ScopeSwitch } from "@/features/deals/scope-switch";
import { ExportButton } from "@/features/export/export-button";
import { todayInSeoul } from "@/features/deals/status";
import { getReportData } from "@/features/reports/queries";
import { byOwner, computeOutcomes, monthly, periods, totals, winRate } from "@/features/reports/report";

type Params = { scope?: string; owner?: string };

// 실적 리포트 — 월별 수주·GP, 이번 달/분기/올해, 승률, 영업대표별 (Salesforce 리포트 참고)
export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <>
      <AppHeader active="core" />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center gap-3 p-10 text-sm text-muted">
              <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-accent/60 border-t-transparent" />
              실적을 불러오는 중…
            </div>
          }
        >
          <Report searchParams={searchParams as Promise<Params>} />
        </Suspense>
      </main>
    </>
  );
}

function eok(n: number) {
  if (n === 0) return "0";
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

async function Report({ searchParams }: { searchParams: Promise<Params> }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  if (!user.teamId) {
    return <p className="p-10 text-center text-sm text-muted">부문에 소속된 사용자만 실적을 볼 수 있습니다.</p>;
  }
  const [members, data] = await Promise.all([getTeamMembers(user.teamId), getReportData(user.teamId)]);
  const scope = resolveScope(params, user, members);
  const ownerFilter = scope.kind === "mine" ? user.id : scope.kind === "member" ? scope.id : null;
  const deals = ownerFilter ? data.deals.filter((d) => d.owner_id === ownerFilter) : data.deals;
  const { wins, losses } = computeOutcomes(deals, data.events);

  const today = todayInSeoul();
  const p = periods(today);
  const cards = [p.month, p.quarter, p.year].map((x) => ({ period: x, t: totals(wins, x) }));
  const since90 = new Date(Date.parse(`${today}T00:00:00Z`) - 89 * 86_400_000).toISOString().slice(0, 10);
  const rate = winRate(wins, losses, since90, today);
  const months = monthly(wins, today);
  const maxMonth = Math.max(1, ...months.map((m) => m.amount));
  const owners = byOwner(wins, p.year);
  const ownersQuarter = new Map(byOwner(wins, p.quarter).map((r) => [r.ownerId, r]));
  const ownersMonth = new Map(byOwner(wins, p.month).map((r) => [r.ownerId, r]));
  const title = scope.kind === "mine" ? "내 실적" : scope.kind === "member" ? `${scope.name}님의 실적` : `${user.teamName ?? "부문"} 실적`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-xs text-muted">수주 = 사업이 처음 &lsquo;수주&rsquo; 이후 단계에 들어간 날 기준 · 실주·삭제된 사업 제외</p>
          </div>
          <ScopeSwitch path="/reports" scope={scope} members={members} meId={user.id} teamName={user.teamName ?? "부문"} />
        </div>
        <ExportButton scope={scope} />
      </div>

      {/* 이번 달 · 분기 · 올해 · 승률 */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ period, t }) => (
          <div key={period.label} className="rounded-2xl border border-line bg-surface/60 p-4">
            <p className="text-[11px] text-muted">{period.label} 수주</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{eok(t.amount)}</p>
            <p className="mt-1 text-xs text-muted tabular-nums">
              {t.count}건 · GP {eok(t.gp)}
              {t.gpRate != null && ` (${t.gpRate}%)`}
            </p>
          </div>
        ))}
        <div className="rounded-2xl border border-line bg-surface/60 p-4">
          <p className="text-[11px] text-muted">승률 · 최근 90일</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{rate.rate == null ? "-" : `${rate.rate}%`}</p>
          <p className="mt-1 text-xs text-muted">
            수주 {rate.won} · 실주 {rate.lost}
            {rate.rate == null && " · 결론 난 사업 없음"}
          </p>
        </div>
      </section>

      {/* 최근 12개월 수주 */}
      <section className="rounded-2xl border border-line bg-surface/60 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">월별 수주 · 최근 12개월</h2>
          <span className="text-[11px] text-muted">막대 = 수주 금액, 아래 = 건수</span>
        </div>
        <div className="flex h-44 items-end gap-1.5 sm:gap-2" role="img" aria-label="월별 수주 금액 막대 그래프">
          {months.map((m) => (
            <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-muted tabular-nums">{m.amount > 0 ? eok(m.amount) : ""}</span>
              <div
                className={`w-full rounded-t-md transition-[height] duration-500 ${m.month === today.slice(0, 7) ? "bg-accent" : "bg-accent/45"}`}
                style={{ height: `${Math.max(m.amount > 0 ? 4 : 1, (m.amount / maxMonth) * 100)}%` }}
                title={`${m.month} · ${m.count}건 · ${eok(m.amount)} · GP ${eok(m.gp)}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5 sm:gap-2">
          {months.map((m) => (
            <div key={m.month} className="min-w-0 flex-1 text-center">
              <p className="text-[10px] text-muted">{m.label}</p>
              <p className="text-[10px] tabular-nums">{m.count || ""}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 영업대표별 (부문 전체 보기) */}
        {scope.kind === "team" && (
          <section className="rounded-2xl border border-line bg-surface/60 p-4">
            <h2 className="mb-3 text-sm font-semibold">영업대표별 수주</h2>
            {owners.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">올해 수주가 없습니다.</p>
            ) : (
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[11px] text-muted">
                  <tr>
                    <th className="pb-2 text-left font-normal">영업대표</th>
                    <th className="pb-2 text-right font-normal">{p.month.label}</th>
                    <th className="pb-2 text-right font-normal">{p.quarter.label}</th>
                    <th className="pb-2 text-right font-normal">{p.year.label}</th>
                    <th className="pb-2 text-right font-normal">GP</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((o) => (
                    <tr key={o.ownerId} className="border-t border-line">
                      <td className={`py-2 ${o.ownerId === user.id ? "text-accent" : ""}`}>
                        {o.owner}
                        {o.ownerId === user.id && " (나)"} <span className="text-muted">· {o.count}건</span>
                      </td>
                      <td className="py-2 text-right">{eok(ownersMonth.get(o.ownerId)?.amount ?? 0)}</td>
                      <td className="py-2 text-right">{eok(ownersQuarter.get(o.ownerId)?.amount ?? 0)}</td>
                      <td className="py-2 text-right font-semibold">{eok(o.amount)}</td>
                      <td className="py-2 text-right text-muted">{eok(o.gp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* 최근 수주 */}
        <section className={`rounded-2xl border border-line bg-surface/60 p-4 ${scope.kind === "team" ? "" : "lg:col-span-2"}`}>
          <h2 className="mb-3 text-sm font-semibold">최근 수주</h2>
          {wins.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">아직 수주한 사업이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {wins.slice(0, 10).map((w) => (
                <li key={w.dealId}>
                  <Link href={`/dashboard?focus=d:${w.dealId}`} className="flex items-center justify-between gap-3 py-2 text-xs hover:text-accent">
                    <span className="min-w-0">
                      <span className="block truncate">{w.name}</span>
                      <span className="text-[11px] text-muted">
                        {w.customer}
                        {scope.kind === "team" && ` · ${w.owner}`} · {w.on}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold">{eok(w.amount)}</span>
                      {w.gp != null && <span className="text-[11px] text-muted">GP {eok(w.gp)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
