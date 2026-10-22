import { DEADLINE_OPTIONS, MIN_SCORE_OPTIONS, type ListQuery } from "../lib/list-query";
import { LEAD_STATUS_LABEL } from "../lib/labels";
import type { LeadStatus } from "../types";

// 필터와 관리자 부문 선택. 주소(GET) 폼이라 자바스크립트 없이도 동작한다 (시각 설계서 §5.5)
const field =
  "h-10 rounded-[4px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] px-3 text-sm text-[var(--sos-text)]";
const apply =
  "relative h-10 rounded-[6px] border border-[var(--sos-divider)] px-3 text-sm text-[var(--sos-text)] transition-colors duration-200 hover:text-[var(--sos-accent)]";

export function LeadFilters({ query }: { query: ListQuery }) {
  return (
    <form action="/sos" className="flex flex-wrap items-center gap-2">
      {query.team && <input type="hidden" name="team" value={query.team} />}
      {query.view !== "deal" && <input type="hidden" name="view" value={query.view} />}
      <label className="sr-only" htmlFor="sos-f-status">상태</label>
      <select id="sos-f-status" name="status" defaultValue={query.status[0] ?? ""} className={field}>
        <option value="">모든 상태</option>
        {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="sos-f-min">점수</label>
      <select id="sos-f-min" name="min" defaultValue={query.minScore ?? ""} className={field}>
        <option value="">모든 점수</option>
        {MIN_SCORE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}점 이상
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="sos-f-due">마감</label>
      <select id="sos-f-due" name="due" defaultValue={query.deadlineWithin ?? ""} className={field}>
        <option value="">마감 전체</option>
        {DEADLINE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}일 안 마감
          </option>
        ))}
      </select>
      <button type="submit" className={apply}>
        적용
      </button>
    </form>
  );
}

// action: 부문을 고른 뒤 돌아갈 SOS 화면 (설정·실행 기록에서도 쓴다)
export function TeamPicker({
  teams,
  current,
  view,
  action = "/sos",
}: {
  teams: { id: string; name: string }[];
  current: string | null;
  view?: ListQuery["view"];
  action?: "/sos" | "/sos/settings" | "/sos/runs";
}) {
  return (
    <form action={action} className="flex items-center gap-2">
      {view && view !== "deal" && <input type="hidden" name="view" value={view} />}
      <label htmlFor="sos-team" className="text-xs font-medium text-[var(--sos-text-sub)]">
        부문
      </label>
      <select id="sos-team" name="team" defaultValue={current ?? ""} className={field} required>
        <option value="" disabled>
          부문 선택
        </option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button type="submit" className={apply}>
        보기
      </button>
    </form>
  );
}
