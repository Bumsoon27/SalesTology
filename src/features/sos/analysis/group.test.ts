import { describe, expect, it } from "vitest";
import type { LeadListItem } from "../types";
import { groupByOrg } from "./group";

let n = 0;
function li(p: Partial<LeadListItem>): LeadListItem {
  n++;
  return {
    id: `l${n}`,
    title: `사업 ${n}`,
    orgName: p.orgId ? `기관 ${p.orgId}` : "기관",
    orgId: "o0",
    companyId: null,
    stage: "prespec",
    status: "new",
    score: 0,
    budget: null,
    nextDeadlineAt: null,
    nextDeadlineType: null,
    summary: null,
    summarySource: null,
    hasNewProgress: false,
    keywordMismatch: false,
    assigneeName: null,
    updatedAt: "2026-10-22T00:00:00.000Z",
    ...p,
  };
}

describe("기관별 묶기", () => {
  it("기관마다 건수·예산 합계·최고 점수, 최고 점수 내림차순", () => {
    const g = groupByOrg([
      li({ orgId: "o1", score: 40, budget: 1e8 }),
      li({ orgId: "o2", score: 90, budget: null }),
      li({ orgId: "o1", score: 70, budget: 2e8 }),
    ]);
    expect(g.map((x) => [x.orgId, x.count, x.budgetSum, x.topScore])).toEqual([
      ["o2", 1, 0, 90],
      ["o1", 2, 3e8, 70],
    ]);
  });

  it("기관 안의 사업은 점수 내림차순", () => {
    const g = groupByOrg([li({ orgId: "o1", score: 40, id: "a" }), li({ orgId: "o1", score: 70, id: "b" })]);
    expect(g[0].items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("기관이 없는 리드는 한 묶음으로 모은다", () => {
    const g = groupByOrg([li({ orgId: null, orgName: "", score: 10 })]);
    expect(g).toHaveLength(1);
    expect(g[0].orgName).toBe("기관 미상");
  });
});
