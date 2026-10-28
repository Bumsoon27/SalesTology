import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { buildBoard } from "@/features/deals/board";
import { summarizePipeline } from "@/features/deals/pipeline";
import { PipelineBoard } from "@/features/deals/pipeline-board";
import { getMyDeals, getPipelineSettings, getTeamDealsFull, getTeamMembers } from "@/features/deals/queries";
import { resolveScope } from "@/features/deals/scope";
import { ScopeSwitch } from "@/features/deals/scope-switch";
import { ExportButton } from "@/features/export/export-button";
import { todayInSeoul } from "@/features/deals/status";

type Params = { scope?: string; owner?: string };

// 파이프라인 보드 (칸반) — 사업을 단계별 열로. 카드를 끌어 단계를 바꾼다. 조회 범위: 개인(기본) / 부문 / 영업대표
export default function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  return (
    <>
      <AppHeader active="pipeline" />
      <main className="flex min-h-0 flex-1 flex-col pt-4">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center gap-3 text-sm text-muted">
              <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-accent/60 border-t-transparent" />
              파이프라인을 불러오는 중…
            </div>
          }
        >
          <Board searchParams={searchParams as Promise<Params>} />
        </Suspense>
      </main>
    </>
  );
}

async function Board({ searchParams }: { searchParams: Promise<Params> }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const [myDeals, teamDeals, members, settings] = await Promise.all([
    getMyDeals(user.id),
    user.teamId ? getTeamDealsFull(user.teamId) : Promise.resolve(null),
    user.teamId ? getTeamMembers(user.teamId) : Promise.resolve([]),
    getPipelineSettings(user.teamId),
  ]);
  const scope = resolveScope(params, user, members);
  // 부문 전체 보기에서만 카드에 영업대표 이름을 붙인다
  const deals =
    scope.kind === "mine" || !teamDeals
      ? myDeals
      : scope.kind === "member"
        ? teamDeals.filter((d) => d.owner_id === scope.id).map((d) => ({ ...d, owner: undefined }))
        : teamDeals;
  const today = todayInSeoul();
  const columns = buildBoard(deals, today, settings);
  const active = columns.flatMap((c) => c.cards).filter((c) => !c.onHold);
  const summary = summarizePipeline(deals, today, settings);
  const eok = (n: number) => (n >= 100_000_000 ? `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억` : `${Math.round(n / 10_000).toLocaleString()}만`);
  const title = scope.kind === "mine" ? "내 파이프라인" : scope.kind === "member" ? `${scope.name}님의 파이프라인` : `${user.teamName ?? "부문"} 파이프라인`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 sm:px-6">
        <div className="space-y-2">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-xs text-muted">카드를 다른 단계로 끌어 옮기세요 · 휴대폰은 카드의 &lsquo;단계&rsquo;에서 바꿉니다</p>
          </div>
          <ScopeSwitch path="/pipeline" scope={scope} members={members} meId={user.id} teamName={user.teamId ? (user.teamName ?? "부문") : null} />
        </div>
        {/* 대시보드 카드와 같은 기준: 확정 = 협상 단계 이상, 전체 강조 */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted tabular-nums">
            진행 {active.length}건 · 확정 {eok(summary.firm)} ({summary.firmCount}건) / <span className="text-sm font-semibold text-fg">전체 {eok(summary.total)}</span>
          </p>
          <ExportButton scope={scope} />
        </div>
      </div>
      {/* 사업 내용·범위가 바뀌면 보드를 새로 그린다 (서버 값 기준) */}
      <PipelineBoard key={`${scope.kind}:${scope.kind === "member" ? scope.id : ""}|${deals.map((d) => `${d.id}:${d.stage}:${d.updated_at}`).join("|")}`} columns={columns} />
    </>
  );
}
