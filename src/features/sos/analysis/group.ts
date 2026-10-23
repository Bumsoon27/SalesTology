// 기관별 보기 묶기 — 순수 함수
import type { LeadListItem } from "../types";

export type OrgGroup = {
  orgId: string;
  orgName: string;
  count: number;
  budgetSum: number;
  topScore: number;
  items: LeadListItem[];
};

// 기관이 아직 정해지지 않은 리드를 모으는 자리
const UNKNOWN_ORG = "";

/** 기관마다 건수·예산 합계(미공개는 0)·최고 점수. 최고 점수 내림차순, 같으면 기관명 */
export function groupByOrg(items: LeadListItem[]): OrgGroup[] {
  const map = new Map<string, OrgGroup>();
  for (const it of items) {
    const key = it.orgId ?? UNKNOWN_ORG;
    const g = map.get(key) ?? { orgId: key, orgName: it.orgName || "기관 미상", count: 0, budgetSum: 0, topScore: 0, items: [] };
    g.count++;
    g.budgetSum += it.budget ?? 0;
    g.topScore = Math.max(g.topScore, it.score);
    g.items.push(it);
    map.set(key, g);
  }
  const groups = [...map.values()];
  for (const g of groups) g.items.sort((a, b) => b.score - a.score);
  return groups.sort((a, b) => b.topScore - a.topScore || a.orgName.localeCompare(b.orgName, "ko"));
}
