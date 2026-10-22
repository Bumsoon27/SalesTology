// DB 행 ↔ 분석 엔진 값 변환 (순수). DB 와 엔진의 표기 차이는 여기서만 맞춘다.
import type { StoredLead } from "../analysis/lead-update";
import { parseAmount } from "../lib/money";
import type { KeywordRow, LeadRow, RawItemRow } from "../server/rows";
import type { Keyword, NormalizedItem } from "../types";

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
  return month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null;
}

/** DB date → 엔진 "YYYY-MM" */
export function dateToMonth(date: string | null): string | null {
  return date ? date.slice(0, 7) : null;
}

/** 같은 기관에 걸린 다른 리드 수 (겹침 점수·요약용). members: 기관 id → 리드 식별자 집합 */
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
