import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { getMyDeals, getTeamDealsFull, getTeamMembers } from "@/features/deals/queries";
import { resolveScope } from "@/features/deals/scope";
import { ScopeSwitch } from "@/features/deals/scope-switch";
import { todayInSeoul } from "@/features/deals/status";
import { collectTodos } from "@/features/deals/todo";
import { TodoList } from "@/features/deals/todo-list";

type Params = { scope?: string; owner?: string };

// 할 일 — 여러 사업의 추적 업무를 기한별로 한 화면에. 조회 범위: 개인(기본) / 부문 / 영업대표
export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <>
      <AppHeader active="core" />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center gap-3 p-10 text-sm text-muted">
              <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-accent/60 border-t-transparent" />
              할 일을 불러오는 중…
            </div>
          }
        >
          <Tasks searchParams={searchParams as Promise<Params>} />
        </Suspense>
      </main>
    </>
  );
}

async function Tasks({ searchParams }: { searchParams: Promise<Params> }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const [myDeals, teamDeals, members] = await Promise.all([
    getMyDeals(user.id),
    user.teamId ? getTeamDealsFull(user.teamId) : Promise.resolve(null),
    user.teamId ? getTeamMembers(user.teamId) : Promise.resolve([]),
  ]);
  const scope = resolveScope(params, user, members);
  const deals = scope.kind === "mine" || !teamDeals ? myDeals : scope.kind === "member" ? teamDeals.filter((d) => d.owner_id === scope.id) : teamDeals;
  const today = todayInSeoul();
  const groups = collectTodos(deals, today);
  const title = scope.kind === "mine" ? "내 할 일" : scope.kind === "member" ? `${scope.name}님의 할 일` : `${user.teamName ?? "부문"} 할 일`;
  const urgent = groups.overdue.length + groups.today.length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
      <div className="space-y-2">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-xs text-muted">
            진행·보류 사업의 미완료 추적 업무 · {urgent > 0 ? <span className="text-st-yellow">지금 챙길 일 {urgent}건</span> : "급한 일 없음"}
          </p>
        </div>
        <ScopeSwitch path="/tasks" scope={scope} members={members} meId={user.id} teamName={user.teamId ? (user.teamName ?? "부문") : null} />
      </div>
      <TodoList key={`${scope.kind}:${scope.kind === "member" ? scope.id : ""}`} groups={groups} today={today} showOwner={scope.kind === "team"} />
    </div>
  );
}
