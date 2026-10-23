import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { BackToDashboard } from "@/shared/ui/back-to-dashboard";
import { getPartners } from "@/features/partners/queries";
import { toScope } from "@/features/partners/count";
import { PartnerBrowser } from "@/features/partners/partner-browser";
import { PartnerForm } from "@/features/partners/partner-form";

// 파트너사(고객사·SI·매입처) 사전 등록 — 영업기회 입력 시 여기서 고른다
export default function PartnersPage({ searchParams }: PageProps<"/partners">) {
  return (
    <>
      <AppHeader active="core" />
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 p-6 lg:grid-cols-[360px_1fr]">
        <div className="lg:col-span-2">
          <BackToDashboard />
        </div>
        <div className="lg:sticky lg:top-6 lg:self-start">
          <PartnerForm />
        </div>
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-lg font-semibold">파트너사</h1>
            <p className="text-xs text-muted">여러 사업에 함께할수록 대시보드에서 더 크게 빛납니다</p>
          </div>
          <Suspense fallback={<p className="text-sm text-muted">불러오는 중…</p>}>
            <PartnerList searchParams={searchParams as Promise<{ scope?: string }>} />
          </Suspense>
        </section>
      </main>
    </>
  );
}

// 보기 범위(부문 전체 / 내 사업 관련 / SOS 인바운드)는 PartnerBrowser 가 화면에서 바로 거른다
async function PartnerList({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const [{ scope }, user] = await Promise.all([searchParams, requireUser()]);
  const partners = await getPartners(user.id);
  return <PartnerBrowser partners={partners} initialScope={toScope(scope)} />;
}
