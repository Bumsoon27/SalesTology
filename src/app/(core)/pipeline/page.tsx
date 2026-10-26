import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { buildBoard } from "@/features/deals/board";
import { PipelineBoard } from "@/features/deals/pipeline-board";
import { getMyDeals, getPipelineSettings } from "@/features/deals/queries";
import { todayInSeoul } from "@/features/deals/status";

// 파이프라인 보드 (칸반) — 내 사업을 단계별 열로. 카드를 끌어 단계를 바꾼다
export default function PipelinePage() {
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
          <Board />
        </Suspense>
      </main>
    </>
  );
}

async function Board() {
  const user = await requireUser();
  const [deals, settings] = await Promise.all([getMyDeals(user.id), getPipelineSettings(user.teamId)]);
  const today = todayInSeoul();
  const columns = buildBoard(deals, today, settings);
  const active = columns.flatMap((c) => c.cards).filter((c) => !c.onHold);
  const total = columns.reduce((s, c) => s + c.total, 0);
  const weighted = columns.reduce((s, c) => s + c.weighted, 0);
  const eok = (n: number) => (n >= 100_000_000 ? `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억` : `${Math.round(n / 10_000).toLocaleString()}만`);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pb-3 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold">파이프라인</h1>
          <p className="text-xs text-muted">카드를 다른 단계로 끌어 옮기세요 · 휴대폰은 카드의 &lsquo;단계&rsquo;에서 바꿉니다</p>
        </div>
        <p className="text-xs text-muted tabular-nums">
          진행 {active.length}건 · 전체 <span className="text-fg">{eok(total)}</span> · 가중 예상 <span className="text-fg">{eok(weighted)}</span>
        </p>
      </div>
      {/* 사업 내용이 바뀌면 보드를 새로 그린다 (서버 값 기준) */}
      <PipelineBoard key={deals.map((d) => `${d.id}:${d.stage}:${d.updated_at}`).join("|")} columns={columns} />
    </>
  );
}
