import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { UniverseShell } from "@/features/topology/universe-shell";
import { UniverseLegend } from "@/features/topology/universe-legend";
import { buildMyUniverse } from "@/features/topology/build-graph";
import { getCompanyNames, getMyDeals } from "@/features/deals/queries";
import { todayInSeoul } from "@/features/deals/status";
import { NewDealDialog } from "@/features/deals/new-deal-dialog";
import { RealtimeRefresh } from "@/features/deals/realtime-refresh";
import { getPartners } from "@/features/partners/queries";
import { PartnerDialog } from "@/features/partners/partner-dialog";

// A 영역 메인 대시보드: '나' 중심의 토폴로지 우주 (설계서 §6)
export default function DashboardPage() {
  return (
    <>
      <AppHeader active="core" />
      <main className="relative flex-1 overflow-hidden">
        <Suspense fallback={<p className="p-6 text-sm text-muted">대시보드를 불러오는 중…</p>}>
          <DashboardUniverse />
        </Suspense>
      </main>
    </>
  );
}

async function DashboardUniverse() {
  const user = await requireUser();
  const [deals, companyNames, partners] = await Promise.all([getMyDeals(user.id), getCompanyNames(), getPartners()]);
  const data = buildMyUniverse({ id: user.id, name: user.name }, deals, todayInSeoul());
  const isEmpty = data.nodes.length === 1;
  // 파트너가 많지 않으면 처음부터 펼쳐서 연관 관계가 보이게 한다
  const expandAll = data.nodes.filter((n) => n.kind === "party").length <= 60;

  return (
    <>
      <UniverseShell data={data} expandAll={expandAll} />

      {isEmpty && (
        <div className="pointer-events-none absolute inset-x-0 top-[58%] flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-fg">첫 영업기회를 등록해 보세요</p>
          <p className="text-xs text-muted">사업이 늘어날수록 나를 중심으로 우주가 넓어집니다</p>
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
        <div className="absolute bottom-4 right-4">
          <UniverseLegend data={data} />
        </div>
      )}
    </>
  );
}
