import { Suspense } from "react";
import { connection } from "next/server";
import { loadOrNotice, resolvePageTeam, teamParam } from "@/features/sos/server/page-team";
import { getRuns } from "@/features/sos/server/settings-queries";
import { TeamPicker } from "@/features/sos/ui/list-controls";
import { Notice } from "@/features/sos/ui/notice";
import { RunsTable } from "@/features/sos/ui/runs-table";
import { SosNav } from "@/features/sos/ui/sos-nav";

// 과거 실행 기록 (설계서 §5.6). 세션·DB 를 읽는 부분은 <Suspense> 안에서만.
export default function SosRunsPage({ searchParams }: PageProps<"/sos/runs">) {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-[var(--sos-text-strong)]">실행 기록</h1>
      <Suspense fallback={<p className="text-sm text-[var(--sos-text-hint)]">실행 기록을 불러오는 중…</p>}>
        <Runs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function load(requested: string | null) {
  const pt = await resolvePageTeam(requested);
  return { pt, runs: pt.kind === "ok" ? await getRuns(pt.teamId) : [] };
}

async function Runs({ searchParams }: { searchParams: PageProps<"/sos/runs">["searchParams"] }) {
  const params = await searchParams;
  const requested = teamParam(params.team);
  await connection();
  const r = await loadOrNotice(() => load(requested), "실행 기록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  if (!r.ok) {
    return (
      <>
        <SosNav current="/sos/runs" team={null} />
        <Notice text={r.text} />
      </>
    );
  }
  const { pt, runs } = r.value;
  const team = pt.kind === "ok" ? pt.runTeam : null;
  return (
    <>
      <SosNav current="/sos/runs" team={team} />
      {pt.isAdmin && <TeamPicker teams={pt.teams} current={pt.kind === "ok" ? pt.teamId : requested} action="/sos/runs" />}
      {pt.kind === "notice" ? <Notice text={pt.text} /> : <RunsTable runs={runs} team={team} />}
    </>
  );
}
