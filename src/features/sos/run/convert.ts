// DB 행 ↔ 분석 엔진 값 변환 (순수). DB 와 엔진의 표기 차이는 여기서만 맞춘다.
import type { StoredLead } from "../analysis/lead-update";
import { parseAmount } from "../lib/money";
import type { KeywordRow, LeadRow, RawItemRow } from "../server/rows";
import type { DeadlineType, Keyword, NormalizedItem, Stage } from "../types";

const text = (v: unknown): string | null => {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/** sos_raw_items 행 → 엔진 항목. 발주월은 칸이 없어 원본(payload)에서 복원한다 */
export function rawRowToItem(r: RawItemRow): NormalizedItem {
  let orderMonth: string | null = null;
  if (r.source === "g2b_plan") {
    const y = text(r.order_year ?? r.payload?.orderYear);
    const m = text(r.order_mnth ?? r.payload?.orderMnth);
    if (y && m) orderMonth = `${y}-${m.padStart(2, "0")}`;
  }
  return {
    source: r.source,
    externalId: r.external_id,
    version: r.version,
    title: r.title,
    orgName: r.org_name ?? "",
    orgCode: r.org_code,
    chainPlanNo: r.chain_plan_no,
    chainPrespecNo: r.chain_prespec_no,
    chainBidNo: r.chain_bid_no,
    budget: parseAmount(r.budget),
    publishedAt: r.published_at,
    deadlineAt: r.deadline_at,
    deadlineType: r.deadline_type,
    orderMonth,
    url: r.url,
    matchText: r.match_text ?? r.title,
    payload: r.payload ?? {},
  };
}

/** 엔진 "YYYY-MM" → DB date "YYYY-MM-01" */
export function monthToDate(month: string | null): string | null {
  return month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${month}-01` : null;
}

/** DB date → 엔진 "YYYY-MM" */
export function dateToMonth(date: string | null): string | null {
  return date ? date.slice(0, 7) : null;
}

/** 같은 기관에 걸린 다른 리드 수, 중복 없이 (겹침 점수 orgSignals90d·요약용 — 시그널 건수가 아니다). members: 기관 id → 리드 식별자 집합 */
export function othersInOrg(members: Map<string, Set<string>>, orgId: string | null, self: string): number {
  if (!orgId) return 0;
  const set = members.get(orgId);
  if (!set) return 0;
  return set.size - (set.has(self) ? 1 : 0);
}

/** 조달(g2b) 출처가 켜진 키워드만 엔진 형태로 */
export function g2bKeywords(rows: KeywordRow[]): Keyword[] {
  return rows
    .filter((k) => k.sources.includes("g2b"))
    .map((k) => ({ id: k.id, term: k.term, tier: k.tier, weight: k.weight, active: k.active }));
}

export function leadToStored(l: LeadRow): StoredLead {
  return {
    status: l.status,
    stage: l.stage,
    nextDeadlineAt: l.next_deadline_at,
    touchedAt: l.touched_at,
    hidden: l.hidden,
    hasNewProgress: l.has_new_progress,
    keywordMismatch: l.keyword_mismatch,
  };
}

/** 분석이 sos_leads 에 쓰는 칸 (team_id·chain_key·last_run_id 제외) */
export type LeadWrite = {
  org_id: string | null;
  title: string;
  stage: Stage;
  budget: number | null;
  expected_order_month: string | null;
  next_deadline_at: string | null;
  next_deadline_type: DeadlineType | null;
  matched_keyword_ids: string[];
  score: number;
  hidden: boolean;
  has_new_progress: boolean;
  keyword_mismatch: boolean;
};

// DB 는 "+00:00", 엔진은 "Z" — 시각으로 비교
const sameTime = (a: string | null, b: string | null) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b));
const sameSet = (a: string[], b: string[]) => {
  const s = new Set(a);
  return s.size === new Set(b).size && b.every((x) => s.has(x));
};

/** 요약에 들어가는 사실(단계·제목·키워드·마감)이 바뀌었는지. 새 리드는 바뀐 것 */
export function leadFactsChanged(prev: LeadRow | null, next: LeadWrite): boolean {
  if (!prev) return true;
  return (
    prev.stage !== next.stage ||
    prev.title !== next.title ||
    !sameSet(prev.matched_keyword_ids ?? [], next.matched_keyword_ids) ||
    prev.next_deadline_type !== next.next_deadline_type ||
    !sameTime(prev.next_deadline_at, next.next_deadline_at)
  );
}

/** 저장할 값이 읽어 온 행과 다른지 — 같으면 쓰지 않아 updated_at 을 올리지 않는다 */
export function leadRowChanged(prev: LeadRow, next: LeadWrite): boolean {
  return (
    leadFactsChanged(prev, next) ||
    prev.org_id !== next.org_id ||
    parseAmount(prev.budget) !== next.budget ||
    prev.expected_order_month !== next.expected_order_month ||
    Number(prev.score) !== next.score ||
    prev.hidden !== next.hidden ||
    prev.has_new_progress !== next.has_new_progress ||
    prev.keyword_mismatch !== next.keyword_mismatch
  );
}
