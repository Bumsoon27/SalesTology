import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/shared/auth/current-user";
import { todayInSeoul } from "@/features/sos/lib/date";
import { leadHref, parseLeadId } from "@/features/sos/lib/lead-view";
import { listHref, parseListQuery, type ListQuery } from "@/features/sos/lib/list-query";
import { SosDbError } from "@/features/sos/server/db";
import { requireSosTeam } from "@/features/sos/server/context";
import {
  getLastRun,
  getLeadDetail,
  getLeads,
  getRunningRun,
  getTeams,
  SosNotReadyError,
  type LastRun,
  type LeadDetail,
  type LeadListItem,
  type TeamOption,
} from "@/features/sos/server/queries";
import { LeadDetailPanel } from "@/features/sos/ui/lead-detail";
import { LeadFilters, TeamPicker } from "@/features/sos/ui/list-controls";
import { LeadList } from "@/features/sos/ui/lead-list";
import { RunButton } from "@/features/sos/ui/run-button";
import { SosNav } from "@/features/sos/ui/sos-nav";
import { ViewToggle } from "@/features/sos/ui/view-toggle";

// B 영역(SOS) 리드 목록 (설계서 §5.1). 세션·DB 를 읽는 부분은 <Suspense> 안에서만.
export default function SosPage({ searchParams }: PageProps<"/sos">) {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-[var(--sos-text-strong)]">사업 리드</h1>
      <Suspense fallback={<p className="text-sm text-[var(--sos-text-hint)]">리드를 불러오는 중…</p>}>
        <SosLeads searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const STATUS_TEXT: Record<LastRun["status"], { text: string; color: string }> = {
  running: { text: "진행 중", color: "text-[var(--sos-accent)]" },
  done: { text: "완료", color: "text-[var(--sos-green)]" },
  partial: { text: "일부 실패", color: "text-[var(--sos-yellow)]" },
  failed: { text: "실패", color: "text-[var(--sos-red)]" },
};

const when = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type PageData =
  | { kind: "notice"; text: string; teams: TeamOption[] }
  | {
      kind: "list";
      teams: TeamOption[];
      runTeam: string | null;
      today: string;
      leads: LeadListItem[];
      // ?lead= 가 있을 때만. 없는 리드·다른 부문 리드는 null
      detail: { lead: LeadDetail | null } | null;
      lastRun: LastRun | null;
      runningRunId: string | null;
    };

/** 화면에 필요한 값을 모은다. DB 가 준비되지 않았거나 조회가 실패하면 안내 문구로 바꾼다 */
async function loadPage(query: ListQuery, leadId: string | null, teamError: boolean): Promise<PageData> {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  // requireSosTeam 은 실패하면 /sos?error=team 으로 돌려보낸다 — 같은 주소로 다시 돌아오지 않게 여기서 먼저 막는다
  if (!isAdmin && !user.teamId) return { kind: "notice", text: "소속 부문이 없어 SOS를 쓸 수 없습니다. 관리자에게 문의해 주세요.", teams: [] };

  let teams: TeamOption[] = [];
  try {
    if (isAdmin) teams = await getTeams();
    if (isAdmin && !query.team && !user.teamId) {
      return { kind: "notice", text: teamError ? "선택한 부문을 찾을 수 없습니다. 다시 골라 주세요." : "볼 부문을 골라 주세요.", teams };
    }
    const { teamId, isAdminView } = await requireSosTeam(query.team);
    await connection();
    const today = todayInSeoul(new Date());
    const [leads, lastRun, runningRunId, lead] = await Promise.all([
      getLeads(teamId, { view: query.view, status: query.status, minScore: query.minScore, deadlineWithin: query.deadlineWithin }),
      getLastRun(teamId),
      getRunningRun(teamId),
      // 부문 조건으로 읽는다 — 다른 부문의 리드 id 를 넣어도 열리지 않는다
      leadId ? getLeadDetail(teamId, leadId) : Promise.resolve(null),
    ]);
    // 실행 액션에는 관리자가 고른 부문만 넘긴다 (서버가 다시 검증한다)
    return {
      kind: "list",
      teams,
      runTeam: isAdminView ? teamId : null,
      today,
      leads,
      detail: leadId ? { lead } : null,
      lastRun,
      runningRunId,
    };
  } catch (e) {
    if (e instanceof SosNotReadyError) return { kind: "notice", text: "SOS 데이터베이스가 아직 준비되지 않았습니다", teams };
    if (e instanceof SosDbError) return { kind: "notice", text: "리드를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.", teams };
    // redirect·동적 렌더링 신호 등은 Next 가 처리하도록 그대로 던진다
    throw e;
  }
}

async function SosLeads({ searchParams }: { searchParams: PageProps<"/sos">["searchParams"] }) {
  const params = await searchParams;
  const query = parseListQuery(params);
  const teamError = params.error === "team";
  const leadId = parseLeadId(params.lead);
  const user = await requireUser();
  const data = await loadPage(query, leadId, teamError);
  const picker =
    user.role === "admin" ? <TeamPicker teams={data.teams} current={query.team ?? user.teamId} view={query.view} /> : null;

  if (data.kind === "notice") {
    return (
      <section className="flex flex-col gap-4">
        <SosNav current="/sos" team={null} />
        {picker}
        <Notice text={data.text} />
      </section>
    );
  }

  const { leads, lastRun, runningRunId, runTeam, today, detail } = data;
  const filtered = query.status.length > 0 || !!query.minScore || !!query.deadlineWithin;
  const neverRun = !lastRun && !runningRunId && leads.length === 0 && !filtered;

  // RunButton 은 빈 상태든 목록이든 같은 자리(같은 부모·key)에 둔다 — 첫 수집 뒤 새로 그려도 진행 결과 표시가 남게
  return (
    <>
      <SosNav current="/sos" team={runTeam} />
      <section
        className={
          neverRun
            ? "flex flex-col items-center gap-4 py-16 text-center"
            : "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        }
      >
        <div className={neverRun ? "flex flex-col items-center gap-3" : "flex flex-col gap-3"}>
          {picker}
          {teamError && <p className="text-xs font-medium text-[var(--sos-yellow)]">선택한 부문을 찾을 수 없어 내 부문을 보여 줍니다.</p>}
          {neverRun ? (
            // 빈 상태 (시각 설계서 §5.6)
            <p className="text-sm text-[var(--sos-text-sub)]">아직 수집한 기록이 없습니다. [수집 시작]을 눌러 보세요</p>
          ) : (
            <LastRunSummary run={lastRun} />
          )}
        </div>
        <RunButton key="run" team={runTeam} runningRunId={runningRunId} />
      </section>

      {!neverRun && (
        <div className={detail ? "grid gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,480px)]" : ""}>
          <section className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ViewToggle query={query} />
              <LeadFilters query={query} />
            </div>
            {leads.length === 0 ? (
              <EmptyFiltered query={query} filtered={filtered} />
            ) : (
              <LeadList
                items={leads}
                view={query.view}
                today={today}
                hrefFor={(id) => leadHref(query, id)}
                selectedId={detail?.lead?.id ?? null}
              />
            )}
          </section>
          {detail && (
            // 좁은 화면에서는 목록 위에 둔다
            <div className="order-first min-w-0 min-[1000px]:order-none">
              {/* [사업으로 전환] 자리는 Task 14 에서 convertSlot 으로 채운다 */}
              <LeadDetailPanel lead={detail.lead} today={today} team={runTeam} closeHref={leadHref(query, null)} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function LastRunSummary({ run }: { run: LastRun | null }) {
  if (!run) return <p className="text-xs font-medium text-[var(--sos-text-sub)]">아직 끝난 수집이 없습니다.</p>;
  const st = STATUS_TEXT[run.status];
  const parts = [
    when.format(new Date(run.startedAt)),
    run.starterName ?? "알 수 없음",
    run.mode === "reanalyze" ? "재분석" : null,
    `새 리드 ${run.created}`,
    `갱신 ${run.updated}`,
  ].filter(Boolean);
  return (
    <p className="sos-num text-xs font-medium text-[var(--sos-text-sub)]">
      마지막 실행 · {parts.join(" · ")} · <span className={st.color}>{st.text}</span>
    </p>
  );
}

function EmptyFiltered({ query, filtered }: { query: ListQuery; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-[var(--sos-text-sub)]">
      <p>{filtered ? "조건에 맞는 리드가 없습니다." : "키워드에 맞는 리드가 아직 없습니다."}</p>
      {filtered && (
        <Link href={listHref(query, { status: [], minScore: undefined, deadlineWithin: undefined })} className="text-[var(--sos-text)] hover:text-[var(--sos-accent)]">
          조건 지우기
        </Link>
      )}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return <p className="rounded-[6px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] p-5 text-sm text-[var(--sos-text-sub)]">{text}</p>;
}
