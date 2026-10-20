import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";

// A 영역 메인 대시보드. 토폴로지 캔버스는 src/features/topology 에서 구현한다.
export default function DashboardPage() {
  return (
    <>
      <AppHeader active="core" />
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <Suspense fallback={<p className="text-gray-400">불러오는 중…</p>}>
          <DashboardBody />
        </Suspense>
      </main>
    </>
  );
}

async function DashboardBody() {
  const user = await requireUser();
  return (
    <div className="space-y-2">
      <p className="text-lg">{user.teamName ?? "전체 부문(관리자)"} · 토폴로지 대시보드</p>
      <p className="text-sm text-gray-500">A1 단계에서 방사형 토폴로지가 이 자리에 들어옵니다.</p>
    </div>
  );
}
