import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { UniverseShell } from "@/features/topology/universe-shell";
import { UniverseLegend } from "@/features/topology/universe-legend";
import { buildMyUniverse, buildTeamUniverse } from "@/features/topology/build-graph";
import { getCompanyNames, getMyDeals, getPipelineSettings, getTeamDealsFull, getTeamMembers } from "@/features/deals/queries";
import { todayInSeoul } from "@/features/deals/status";
import { NewDealDialog } from "@/features/deals/new-deal-dialog";
import { RealtimeRefresh } from "@/features/deals/realtime-refresh";
import { getPartners } from "@/features/partners/queries";
import { PartnerDialog } from "@/features/partners/partner-dialog";
import { summarizeByOwner, summarizePipeline } from "@/features/deals/pipeline";
import { topDirections } from "@/features/deals/direction";
import { PipelineSummaryCard } from "@/features/deals/pipeline-summary";
import { resolveScope } from "@/features/deals/scope";
import { ScopeSwitch } from "@/features/deals/scope-switch";

type Params = { scope?: string; owner?: string };

// A 영역 메인 대시보드: '나'(또는 부문·영업대표) 중심의 토폴로지 우주 (설계서 §6)
export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <AppHeader active="core" />
      <main className="relative flex-1 overflow-hidden">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted">
              <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-accent/60 border-t-transparent" />
              대시보드를 불러오는 중…
            </div>
          }
        >
          <DashboardUniverse searchParams={searchParams as Promise<Params>} />
        </Suspense>
      </main>
    </>
  );
}

async function DashboardUniverse({ searchParams }: { searchParams: Promise<Params> }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const [myDeals, companyNames, partners, teamDeals, members, settings] = await Promise.all([
    getMyDeals(user.id),
    getCompanyNames(),
    getPartners(),
    user.teamId ? getTeamDealsFull(user.teamId) : Promise.resolve(null),
    user.teamId ? getTeamMembers(user.teamId) : Promise.resolve([]),
    getPipelineSettings(user.teamId),
  ]);
  const scope = resolveScope(params, user, members);
  const today = todayInSeoul();

  // 조회 범위에 맞는 사업과 우주
  const deals =
    scope.kind === "mine" || !teamDeals ? myDeals : scope.kind === "member" ? teamDeals.filter((d) => d.owner_id === scope.id) : teamDeals;
  const data =
    scope.kind === "team" && teamDeals
      ? buildTeamUniverse({ name: user.teamName ?? "부문" }, teamDeals, today)
      : buildMyUniverse(scope.kind === "member" ? { id: scope.id, name: scope.name } : { id: user.id, name: user.name }, deals, today);

  const pipeline = summarizePipeline(deals, today, settings);
  // 갱신 사업이 이미 있는 사업은 갱신 제안을 빼고 (출처 참조 renewal:<id>, 볼 수 있는 사업 기준)
  const renewed = new Set([...myDeals, ...(teamDeals ?? [])].map((d) => d.source_ref).filter((r): r is string => !!r?.startsWith("renewal:")));
  const directions = topDirections(
    deals.map((d) => ({ ...d, renewal_exists: renewed.has(`renewal:${d.id}`) })),
    today,
    6,
    settings.staleAfterDays,
  );
  const team = teamDeals
    ? { summary: summarizePipeline(teamDeals, today, settings), owners: summarizeByOwner(teamDeals, user.id, settings) }
    : null;
  const isEmpty = !data.nodes.some((n) => n.kind === "customer");
  // 파트너가 많지 않으면 처음부터 펼쳐서 연관 관계가 보이게 한다
  const expandAll = data.nodes.filter((n) => n.kind === "party").length <= 60;

  return (
    <>
      <UniverseShell
        data={data}
        expandAll={expandAll}
        toolbar={<ScopeSwitch path="/dashboard" scope={scope} members={members} meId={user.id} teamName={user.teamId ? (user.teamName ?? "부문") : null} />}
      />

      {isEmpty && (
        <div className="pointer-events-none absolute inset-x-0 top-[58%] flex flex-col items-center gap-2 text-center">
          {scope.kind === "mine" ? (
            <>
              <p className="text-sm text-fg">첫 영업기회를 등록해 보세요</p>
              <p className="text-xs text-muted">사업이 늘어날수록 나를 중심으로 우주가 넓어집니다</p>
            </>
          ) : (
            <p className="text-sm text-muted">이 범위에는 진행 중인 사업이 없습니다</p>
          )}
        </div>
      )}

      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <RealtimeRefresh />
        {user.teamId ? (
          <>
            <NewDealDialog companyNames={companyNames} partners={partners.map((p) => ({ name: p.name, roles: p.roles }))} />
            <PartnerDialog />
          </>
        ) : (
          <span className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted">관리자 계정은 부문이 없어 사업을 등록할 수 없습니다</span>
        )}
      </div>

      {!isEmpty && (
        <>
          <div className="absolute bottom-16 left-4 z-10 sm:bottom-4">
            <PipelineSummaryCard summary={pipeline} directions={directions} team={team} settings={settings} />
          </div>
          <div className="absolute bottom-4 right-4">
            <UniverseLegend data={data} />
          </div>
        </>
      )}
    </>
  );
}
