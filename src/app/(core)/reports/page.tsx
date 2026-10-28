import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { getPipelineSettings, getTeamMembers } from "@/features/deals/queries";
import { resolveScope } from "@/features/deals/scope";
import { ScopeSwitch } from "@/features/deals/scope-switch";
import { ExportButton } from "@/features/export/export-button";
import { todayInSeoul } from "@/features/deals/status";
import { getCompetitorEntries, getPersonalTargets, getReportData, getTargets } from "@/features/reports/queries";
import { competitorStats, type Outcome } from "@/features/deals/competitors/competitors";
import { attainment, coverage, elapsedPct, targetFor } from "@/features/reports/targets";
import { TargetEditor } from "@/features/reports/target-editor";
import { advances, weekStats, weeks } from "@/features/reports/weekly";
import { funnel } from "@/features/reports/funnel";
import { LOSS_LABEL, lossBreakdown } from "@/features/deals/loss";
import { STAGE_LABEL } from "@/features/deals/types";
import { byOwner, computeOutcomes, monthly, periods, salesCycle, totals, winRate } from "@/features/reports/report";

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
  const year = Number(todayInSeoul().slice(0, 4));
  // 목표: 부문 보기는 부문 목표, 개인·영업대표 보기는 그 사람의 개인 목표
  const [targets, competitorEntries, settings, personalTargets] = await Promise.all([
    getTargets(user.teamId, ownerFilter, year),
    getCompetitorEntries(user.teamId),
    getPipelineSettings(user.teamId),
    scope.kind === "team" ? getPersonalTargets(user.teamId, year) : Promise.resolve(new Map()),
  ]);
  const deals = ownerFilter ? data.deals.filter((d) => d.owner_id === ownerFilter) : data.deals;
  const { wins, losses } = computeOutcomes(deals, data.events);

  const today = todayInSeoul();
  const p = periods(today);
  // 기간 끝 날짜 (경과율 — 달성률이 이보다 낮으면 뒤처진 것)
  const endOf = (from: string, months: number) => {
    const d = new Date(`${from}T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 0)).toISOString().slice(0, 10);
  };
  const cards = [
    { period: p.month, end: endOf(p.month.from, 1) },
    { period: p.quarter, end: endOf(p.quarter.from, 3) },
    { period: p.year, end: endOf(p.year.from, 12) },
  ].map(({ period, end }) => {
    const t = totals(wins, period);
    const target = targetFor(targets, period);
    return { period, t, target, pct: attainment(t.amount, target), pace: elapsedPct(period, today, end) };
  });
  const since90 = new Date(Date.parse(`${today}T00:00:00Z`) - 89 * 86_400_000).toISOString().slice(0, 10);
  const rate = winRate(wins, losses, since90, today);
  // 수주 기간 — 최근 1년 안에 수주한 사업의 등록 → 수주 일수
  const cycle = salesCycle(wins, deals, new Date(Date.parse(`${today}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10), today, data.events);
  const months = monthly(wins, today);
  const maxMonth = Math.max(1, ...months.map((m) => m.amount));
  // 올해 수주가 없어도 개인 목표가 있는 사람은 0 으로 보여준다 (달성률 0%)
  const ownersWon = byOwner(wins, p.year);
  const owners = [
    ...ownersWon,
    ...members.filter((m) => personalTargets.has(m.id) && !ownersWon.some((o) => o.ownerId === m.id)).map((m) => ({ ownerId: m.id, owner: m.name, count: 0, amount: 0, gp: 0 })),
  ];
  const ownersQuarter = new Map(byOwner(wins, p.quarter).map((r) => [r.ownerId, r]));
  const ownersMonth = new Map(byOwner(wins, p.month).map((r) => [r.ownerId, r]));
  // 파이프라인 커버리지 — 올해 남은 목표 대비 수주 전 진행 중 사업
  const yearCard = cards[2];
  const cov = coverage(deals, settings.probabilities, yearCard.target, yearCard.t.amount);
  // 단계별 전환 — 최근 1년 안에 등록한 사업
  const funnelRows = funnel(deals, data.events, new Date(Date.parse(`${today}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10));
  const funnelTop = Math.max(1, funnelRows[0]?.reached ?? 0);
  // 실주 사유 — 최근 1년 안에 실주한 사업
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
  const lossRows = lossBreakdown(deals, new Set(losses.filter((l) => l.on >= yearAgo).map((l) => l.dealId)));
  const lossTotal = lossRows.reduce((n, r) => n + r.count, 0);
  // 경쟁사별 전적 — 보이는 범위의 사업만
  const outcomeOf = new Map<string, Outcome>([...wins.map((w) => [w.dealId, "won"] as const), ...losses.map((l) => [l.dealId, "lost"] as const)]);
  const inScopeIds = new Set(deals.map((d) => d.id));
  const rivals = competitorStats(
    competitorEntries.filter((e) => inScopeIds.has(e.dealId)),
    outcomeOf,
  ).slice(0, 10);
  // 주간 브리핑 — 이번 주(월~오늘) vs 지난주 같은 기간
  const wk = weeks(today);
  const thisWeek = weekStats(deals, data.events, wins, losses, wk.thisWeek);
  const lastWeek = weekStats(deals, data.events, wins, losses, wk.lastWeek);
  const moved = advances(deals, data.events, wk.thisWeek);
  const brief = [
    { label: "수주", now: thisWeek.won, prev: lastWeek.won, sub: thisWeek.won ? eok(thisWeek.wonAmount) : null, bad: false },
    { label: "단계 진전", now: thisWeek.advanced, prev: lastWeek.advanced, sub: null, bad: false },
    { label: "신규 사업", now: thisWeek.created, prev: lastWeek.created, sub: null, bad: false },
    { label: "실주", now: thisWeek.lost, prev: lastWeek.lost, sub: null, bad: true },
  ];
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

      {/* 주간 브리핑 */}
      <section className="rounded-2xl border border-line bg-surface/60 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-sm font-semibold">이번 주 브리핑</h2>
          <span className="text-[11px] text-muted tabular-nums">
            {wk.thisWeek.from.slice(5).replace("-", "/")} ~ {wk.thisWeek.to.slice(5).replace("-", "/")} · 지난주 같은 기간과 비교
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {brief.map((b) => {
            const diff = b.now - b.prev;
            const good = b.bad ? diff < 0 : diff > 0;
            return (
              <div key={b.label}>
                <p className="text-[11px] text-muted">{b.label}</p>
                <p className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums">{b.now}</span>
                  <span className="text-[11px] text-muted">건</span>
                  {diff !== 0 && (
                    <span className={`text-[11px] tabular-nums ${good ? "text-st-green" : "text-st-yellow"}`} title={`지난주 ${b.prev}건`}>
                      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
                    </span>
                  )}
                </p>
                {b.sub && <p className="text-[11px] text-muted tabular-nums">{b.sub}</p>}
              </div>
            );
          })}
        </div>
        {moved.length > 0 && (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {moved.slice(0, 6).map((a) => (
              <li key={a.dealId}>
                <Link href={`/dashboard?focus=d:${a.dealId}`} className="flex items-center justify-between gap-3 py-2 text-xs hover:text-accent">
                  <span className="min-w-0 truncate">
                    {a.name} <span className="text-muted">· {a.customer}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {STAGE_LABEL[a.from]} → <span className="text-fg">{STAGE_LABEL[a.to]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 이번 달 · 분기 · 올해 · 승률 */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ period, t, target, pct, pace }) => (
          <div key={period.label} className="rounded-2xl border border-line bg-surface/60 p-4">
            <p className="flex items-baseline justify-between text-[11px] text-muted">
              <span>{period.label} 수주</span>
              {pct != null && <span className={pct >= pace ? "text-st-green" : "text-st-yellow"}>{pct}%</span>}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{eok(t.amount)}</p>
            <p className="mt-1 text-xs text-muted tabular-nums">
              {t.count}건 · GP {eok(t.gp)}
              {t.gpRate != null && ` (${t.gpRate}%)`}
            </p>
            {target != null && (
              <div className="mt-2.5" title={`목표 ${eok(target)} · 기간 경과 ${pace}%`}>
                {/* 달성 막대 + 지금쯤 있어야 할 위치(경과율) 표시 */}
                <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${pct != null && pct >= pace ? "bg-st-green" : "bg-st-yellow"}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                  <span aria-hidden className="absolute top-0 h-full w-px bg-fg/60" style={{ left: `${pace}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-muted tabular-nums">
                  목표 {eok(target)} · {pct != null && pct >= pace ? "순항" : "뒤처짐"} (경과 {pace}%)
                </p>
              </div>
            )}
          </div>
        ))}
        <div className="rounded-2xl border border-line bg-surface/60 p-4">
          <p className="text-[11px] text-muted">승률 · 최근 90일</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{rate.rate == null ? "-" : `${rate.rate}%`}</p>
          <p className="mt-1 text-xs text-muted">
            수주 {rate.won} · 실주 {rate.lost}
            {rate.rate == null && " · 결론 난 사업 없음"}
          </p>
          {cycle && (
            <p className="mt-2.5 border-t border-line pt-2 text-[11px] text-muted tabular-nums" title={`최근 1년 수주 ${cycle.count}건의 등록 → 수주 일수`}>
              수주까지 평균 <span className="text-fg">{cycle.avg}일</span> · 중앙 {cycle.median}일
            </p>
          )}
        </div>
      </section>

      {cov && (
        <p className="-mt-3 rounded-xl border border-line bg-white/[0.02] px-4 py-2.5 text-xs text-muted tabular-nums">
          {cov.remaining === 0 ? (
            <span className="text-st-green">{p.year.label} 목표를 달성했습니다</span>
          ) : (
            <>
              {p.year.label} 남은 목표 <span className="text-fg">{eok(cov.remaining)}</span> · 진행 중 파이프라인 {eok(cov.open)}{" "}
              <span className={cov.ratio != null && cov.ratio >= 3 ? "text-st-green" : cov.ratio != null && cov.ratio >= 1 ? "text-st-yellow" : "text-st-red"} title="남은 목표 대비 수주 전 진행 중 사업 규모 — 보통 3배 이상이면 여유">
                (커버리지 {cov.ratio}배)
              </span>{" "}
              · 가중 예상 {eok(cov.weighted)} ({cov.weightedRatio}배)
            </>
          )}
        </p>
      )}

      {/* 목표 입력 — 부문 목표(부문 보기) 또는 내 목표(개인 보기). 다른 사람 목표는 본인·관리자만 바꿀 수 있어 숨긴다 */}
      {scope.kind !== "member" && (
        <TargetEditor
          key={`${ownerFilter ?? "team"}-${year}`}
          ownerId={ownerFilter}
          year={year}
          initial={Object.fromEntries(targets.map((t) => [t.month, t.amount]))}
          label={scope.kind === "team" ? `${user.teamName ?? "부문"}` : "내"}
        />
      )}

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

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {/* 영업대표별 (부문 전체 보기) */}
        {scope.kind === "team" && (
          <section className="rounded-2xl border border-line bg-surface/60 p-4">
            <h2 className="mb-3 text-sm font-semibold">영업대표별 수주</h2>
            {owners.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">올해 수주가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[22rem] text-xs tabular-nums">
                <thead className="text-[11px] text-muted">
                  <tr>
                    <th className="pb-2 text-left font-normal">영업대표</th>
                    <th className="pb-2 text-right font-normal">{p.month.label}</th>
                    <th className="pb-2 text-right font-normal">{p.quarter.label}</th>
                    <th className="pb-2 text-right font-normal">{p.year.label}</th>
                    <th className="pb-2 text-right font-normal">GP</th>
                    {personalTargets.size > 0 && <th className="pb-2 text-right font-normal">목표 달성</th>}
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
                      {personalTargets.size > 0 &&
                        (() => {
                          const t = targetFor(personalTargets.get(o.ownerId) ?? [], p.year);
                          const pct = attainment(o.amount, t);
                          return (
                            <td className="py-2 text-right" title={t == null ? "개인 목표 없음" : `목표 ${eok(t)}`}>
                              {pct == null ? <span className="text-muted">-</span> : <span className={pct >= yearCard.pace ? "text-st-green" : "text-st-yellow"}>{pct}%</span>}
                            </td>
                          );
                        })()}
                    </tr>
                  ))}
                </tbody>
              </table></div>
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

      {/* 단계별 전환 (퍼널) */}
      <section className="rounded-2xl border border-line bg-surface/60 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-sm font-semibold">단계별 전환 · 최근 1년 등록 사업</h2>
          <span className="text-[11px] text-muted">한 번이라도 그 단계까지 간 사업 수 · 오른쪽 = 앞 단계 대비 · 입찰은 경쟁입찰 사업만, 수주는 협상 대비</span>
        </div>
        {funnelRows[0]?.reached ? (
          <ul className="space-y-1.5">
            {funnelRows.map((r) => (
              <li key={r.stage} className="grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-2 text-xs tabular-nums">
                <span className="text-muted">{STAGE_LABEL[r.stage]}</span>
                <span className="h-4 overflow-hidden rounded bg-white/[0.04]">
                  <span className={`block h-full rounded ${r.stage === "won" ? "bg-st-green/70" : "bg-accent/50"}`} style={{ width: `${Math.max(2, (r.reached / funnelTop) * 100)}%` }} />
                </span>
                <span className="text-right">
                  {r.reached}건 <span className="text-muted">{r.stepPct == null ? "" : `· ${r.stepPct}%`}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-xs text-muted">최근 1년 안에 등록한 사업이 없습니다.</p>
        )}
      </section>

      {/* 실주 사유 */}
      <section className="rounded-2xl border border-line bg-surface/60 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-sm font-semibold">실주 사유 · 최근 1년</h2>
          <span className="text-[11px] text-muted">상세 패널에서 상태를 &lsquo;실주&rsquo;로 바꿀 때 고른 사유</span>
        </div>
        {lossTotal === 0 ? (
          <p className="py-6 text-center text-xs text-muted">최근 1년 실주가 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {lossRows.map((r) => (
              <li key={r.reason} className="grid grid-cols-[7rem_1fr_6rem] items-center gap-2 text-xs tabular-nums">
                <span className={r.reason === "unknown" ? "text-muted" : ""}>{r.reason === "unknown" ? "사유 미입력" : LOSS_LABEL[r.reason]}</span>
                <span className="h-3 overflow-hidden rounded bg-white/[0.04]">
                  <span className={`block h-full rounded ${r.reason === "unknown" ? "bg-white/15" : "bg-st-red/60"}`} style={{ width: `${(r.count / lossTotal) * 100}%` }} />
                </span>
                <span className="text-right">
                  {r.count}건 <span className="text-muted">· {eok(r.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 경쟁사별 전적 — 상세 패널 '경쟁사'에 기록한 것 */}
      <section className="rounded-2xl border border-line bg-surface/60 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-sm font-semibold">경쟁사별 전적</h2>
          <span className="text-[11px] text-muted">맞붙은 사업 중 우리 수주 · 그 경쟁사 낙찰 · 다른 곳 · 진행 중</span>
        </div>
        {rivals.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">아직 기록된 경쟁사가 없습니다. 사업 상세 패널의 &lsquo;경쟁사&rsquo;에서 기록하세요.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[26rem] text-xs tabular-nums">
            <thead className="text-[11px] text-muted">
              <tr>
                <th className="pb-2 text-left font-normal">경쟁사</th>
                <th className="pb-2 text-right font-normal">사업</th>
                <th className="pb-2 text-right font-normal">우리 수주</th>
                <th className="pb-2 text-right font-normal">그쪽 낙찰</th>
                <th className="pb-2 text-right font-normal">다른 곳</th>
                <th className="pb-2 text-right font-normal">진행 중</th>
                <th className="pb-2 text-right font-normal">우리 승률</th>
              </tr>
            </thead>
            <tbody>
              {rivals.map((r) => {
                const decided = r.weWon + r.theyWon + r.otherWon;
                return (
                  <tr key={r.name} className="border-t border-line">
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 text-right">{r.deals}</td>
                    <td className="py-2 text-right text-st-green">{r.weWon}</td>
                    <td className="py-2 text-right text-st-red">{r.theyWon}</td>
                    <td className="py-2 text-right text-muted">{r.otherWon}</td>
                    <td className="py-2 text-right text-muted">{r.open}</td>
                    <td className="py-2 text-right font-semibold">{decided ? `${Math.round((r.weWon / decided) * 100)}%` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
