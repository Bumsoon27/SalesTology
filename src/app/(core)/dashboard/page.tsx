import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { Universe } from "@/features/topology/universe";
import { UniverseLegend } from "@/features/topology/universe-legend";
import { buildDemoUniverse } from "@/features/topology/demo-data";

// A 영역 메인 대시보드: '나' 중심의 토폴로지 우주 (설계서 §6)
export default function DashboardPage() {
  return (
    <>
      <AppHeader active="core" />
      <main className="relative flex-1 overflow-hidden">
        <Suspense fallback={<p className="p-6 text-sm text-muted">우주를 불러오는 중…</p>}>
          <DashboardUniverse />
        </Suspense>
      </main>
    </>
  );
}

async function DashboardUniverse() {
  const user = await requireUser();
  // TODO(A1): 실제 사업 데이터로 교체 — 영업기회 테이블·입력 폼이 들어오면 build-graph 로 만든다
  const data = buildDemoUniverse(user.name);

  return (
    <>
      <div className="absolute inset-0">
        <Universe data={data} />
      </div>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-end justify-between">
        <div className="pointer-events-auto">
          <UniverseLegend data={data} />
        </div>
        <span className="rounded-full border border-st-yellow/40 px-3 py-1 text-xs text-st-yellow">데모 데이터</span>
      </div>
    </>
  );
}
