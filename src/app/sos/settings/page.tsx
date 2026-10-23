import { Suspense } from "react";
import { connection } from "next/server";
import { formatKst } from "@/features/sos/lib/run-view";
import { loadOrNotice, resolvePageTeam, teamParam } from "@/features/sos/server/page-team";
import { getRunningRunMode, getSettingsData } from "@/features/sos/server/settings-queries";
import { ChangeLog } from "@/features/sos/ui/change-log";
import { KeywordChips } from "@/features/sos/ui/keyword-chips";
import { TeamPicker } from "@/features/sos/ui/list-controls";
import { Notice } from "@/features/sos/ui/notice";
import { ProductList } from "@/features/sos/ui/product-list";
import { RunButton } from "@/features/sos/ui/run-button";
import { SosNav } from "@/features/sos/ui/sos-nav";
import { panel, sectionTitle } from "@/features/sos/ui/sos-styles";
import { TeamSettingsForm } from "@/features/sos/ui/team-settings-form";

// 관심 키워드 설정 (설계서 §5.4). 세션·DB 를 읽는 부분은 <Suspense> 안에서만.
export default function SosSettingsPage({ searchParams }: PageProps<"/sos/settings">) {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-[var(--sos-text-strong)]">키워드 설정</h1>
      <Suspense fallback={<p className="text-sm text-[var(--sos-text-hint)]">설정을 불러오는 중…</p>}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function load(requested: string | null) {
  const pt = await resolvePageTeam(requested);
  if (pt.kind === "notice") return { pt, data: null, running: null };
  const [data, running] = await Promise.all([getSettingsData(pt.teamId), getRunningRunMode(pt.teamId)]);
  return { pt, data, running };
}

async function Settings({ searchParams }: { searchParams: PageProps<"/sos/settings">["searchParams"] }) {
  const params = await searchParams;
  const requested = teamParam(params.team);
  await connection();
  const r = await loadOrNotice(() => load(requested), "설정을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  if (!r.ok) {
    return (
      <>
        <SosNav current="/sos/settings" team={null} />
        <Notice text={r.text} />
      </>
    );
  }
  const { pt, data, running } = r.value;
  const picker = pt.isAdmin ? <TeamPicker teams={pt.teams} current={pt.kind === "ok" ? pt.teamId : requested} action="/sos/settings" /> : null;
  if (pt.kind === "notice" || !data) {
    return (
      <>
        <SosNav current="/sos/settings" team={null} />
        {picker}
        <Notice text={pt.kind === "notice" ? pt.text : ""} />
      </>
    );
  }

  const team = pt.runTeam;
  const linkCount: Record<string, number> = {};
  for (const k of data.keywords) for (const p of k.productIds) linkCount[p] = (linkCount[p] ?? 0) + 1;
  const changes = data.changes.map((c) => ({ ...c, whenText: formatKst(c.createdAt) }));

  return (
    <>
      <SosNav current="/sos/settings" team={team} />
      {picker}
      <div className="grid gap-8 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section className={panel} aria-labelledby="sos-kw-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="sos-kw-title" className={sectionTitle}>
                  관심 키워드
                </h2>
                <p className="text-xs font-medium text-[var(--sos-text-sub)]">
                  키워드 변경은 다음 수집부터 반영됩니다. 보관 중인 원본에 바로 적용하려면 [재분석]을 누르세요.
                </p>
              </div>
              {/* 진행 중인 실행(수집이든 재분석이든)이 있으면 이어서 보여 준다 */}
              <RunButton mode="reanalyze" team={team} runningRunId={running?.id ?? null} runningMode={running?.mode} />
            </div>
            <KeywordChips keywords={data.keywords} products={data.products} team={team} />
          </section>
          <section className={panel} aria-labelledby="sos-log-title">
            <h2 id="sos-log-title" className={sectionTitle}>
              변경 이력
            </h2>
            <ChangeLog items={changes} team={team} />
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <section className={panel} aria-labelledby="sos-team-title">
            <h2 id="sos-team-title" className={sectionTitle}>
              부문 설정
            </h2>
            <TeamSettingsForm settings={data.settings} team={team} />
          </section>
          <section className={panel} aria-labelledby="sos-product-title">
            <h2 id="sos-product-title" className={sectionTitle}>
              제안할 제품
            </h2>
            <ProductList products={data.products} linkCount={linkCount} team={team} />
          </section>
        </div>
      </div>
    </>
  );
}
