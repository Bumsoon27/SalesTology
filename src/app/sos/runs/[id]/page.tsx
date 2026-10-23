import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { LEAD_STATUS_LABEL, STAGE_LABEL } from "@/features/sos/lib/labels";
import { leadHref } from "@/features/sos/lib/lead-view";
import { parseRunId } from "@/features/sos/lib/run-view";
import { loadOrNotice, resolvePageTeam, teamParam } from "@/features/sos/server/page-team";
import { getRunWithLeads, type RunLead } from "@/features/sos/server/settings-queries";
import { Notice } from "@/features/sos/ui/notice";
import { RunSummary } from "@/features/sos/ui/runs-table";
import { SosNav } from "@/features/sos/ui/sos-nav";
import { touchArea } from "@/features/sos/ui/sos-styles";

// 한 실행에서 나온 리드 (설계서 §5.6) — 그 실행의 sos_signals 가 가리키는 리드. 다른 부문의 실행은 404
export default function SosRunPage({ params, searchParams }: PageProps<"/sos/runs/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-6 min-[1000px]:px-6">
      <h1 className="text-xl font-semibold text-[var(--sos-text-strong)]">실행 결과</h1>
      <Suspense fallback={<p className="text-sm text-[var(--sos-text-hint)]">실행 결과를 불러오는 중…</p>}>
        <RunDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function load(requested: string | null, runId: string) {
  const pt = await resolvePageTeam(requested);
  // 부문 조건으로 읽는다 — 다른 부문의 실행 id 를 넣으면 없는 것으로 본다 (404)
  return { pt, data: pt.kind === "ok" ? await getRunWithLeads(pt.teamId, runId) : null };
}

async function RunDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/sos/runs/[id]">["params"];
  searchParams: PageProps<"/sos/runs/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const runId = parseRunId(id);
  if (!runId) notFound();
  const requested = teamParam(sp.team);
  await connection();
  const r = await loadOrNotice(() => load(requested, runId), "실행 결과를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  if (!r.ok) {
    return (
      <>
        <SosNav current="/sos/runs" team={null} />
        <Notice text={r.text} />
      </>
    );
  }
  const { pt, data } = r.value;
  if (pt.kind === "notice") {
    return (
      <>
        <SosNav current="/sos/runs" team={null} />
        <Notice text={pt.text} />
      </>
    );
  }
  if (!data) notFound();
  const team = pt.runTeam;
  const back = team ? `/sos/runs?team=${encodeURIComponent(team)}` : "/sos/runs";
  return (
    <>
      <SosNav current="/sos/runs" team={team} />
      <section className="flex flex-col gap-3 rounded-[6px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] p-5">
        <RunSummary run={data.run} />
        <Link href={back} className={`${touchArea} self-start text-xs font-medium text-[var(--sos-text-sub)] hover:text-[var(--sos-accent)]`}>
          ← 실행 기록
        </Link>
      </section>
      <RunLeads leads={data.leads} team={team} />
    </>
  );
}

function RunLeads({ leads, team }: { leads: RunLead[]; team: string | null }) {
  if (leads.length === 0) return <p className="py-12 text-center text-sm text-[var(--sos-text-sub)]">이 실행에서 나온 리드가 없습니다.</p>;
  const created = leads.filter((l) => l.isNew).length;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sos-run-leads">
      <h2 id="sos-run-leads" className="text-base font-semibold text-[var(--sos-text)]">
        리드 <span className="sos-num text-xs font-medium text-[var(--sos-text-sub)]">새 {created} · 갱신 {leads.length - created}</span>
      </h2>
      <ul className="flex flex-col">
        {leads.map((l) => (
          <li key={l.id} className="border-b border-[var(--sos-divider-lite)] last:border-b-0">
            <Link
              href={leadHref({ team, view: "deal", status: [] }, l.id)}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 transition-colors duration-200 hover:text-[var(--sos-accent)]"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base text-[var(--sos-text-strong)]">{l.title}</span>
                <span className="text-xs font-medium text-[var(--sos-text-sub)]">
                  {l.orgName || "기관 미상"} · {STAGE_LABEL[l.stage]} · {LEAD_STATUS_LABEL[l.status]}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className={`text-xs font-medium ${l.isNew ? "text-[var(--sos-yellow)]" : "text-[var(--sos-text-hint)]"}`}>{l.isNew ? "새 리드" : "갱신"}</span>
                <span className="sos-num text-base font-semibold text-[var(--sos-text-strong)]">{l.score}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
