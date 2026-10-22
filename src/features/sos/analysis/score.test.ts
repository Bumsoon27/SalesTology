import { describe, expect, it } from "vitest";
import { parseKst } from "../lib/date";
import type { Keyword, Stage, Tier } from "../types";
import type { LeadDraft } from "./chain";
import { scoreLead } from "./score";

const K = (term: string, tier: Tier, weight: number | null = null): Keyword => ({
  id: term,
  term,
  tier,
  weight,
  active: true,
});

const draft = (over: Partial<LeadDraft> & { stage?: Stage } = {}): LeadDraft => ({
  chainKey: "plan:TEST-1",
  title: "테스트 사업",
  orgName: "테스트기관",
  orgCode: null,
  stage: "prespec",
  budget: null,
  orderMonth: null,
  nextDeadlineAt: null,
  nextDeadlineType: null,
  items: [],
  ...over,
});

const base = {
  draft: draft({
    stage: "prespec",
    budget: 320000000,
    nextDeadlineAt: parseKst("2026-10-28 18:00:00"),
    orderMonth: "2026-12",
  }),
  matched: [K("LTO드라이브", "core"), K("FlashSystem", "extended")],
  orgSignals90d: 1,
  today: "2026-10-22",
};

describe("scoreLead", () => {
  it("항목별 점수와 합산 점수를 계산한다", () => {
    expect(scoreLead(base).parts).toEqual({ fit: 4, timing: 5, stage: 2, budget: 1, corroboration: 2 });
    expect(scoreLead(base).score).toBe(Math.round((14 / 22) * 100));
  });

  it("누락 값(예산·마감·발주월·매칭 없음·신호 없음)은 0점이다", () => {
    const empty = {
      ...base,
      draft: draft({ stage: "bid", budget: null, nextDeadlineAt: null, orderMonth: null }),
      matched: [],
      orgSignals90d: 0,
    };
    expect(scoreLead(empty).score).toBe(0);
  });

  it("fit 은 9점에서 잘린다", () => {
    expect(scoreLead({ ...base, matched: Array(5).fill(K("x", "core")) }).parts.fit).toBe(9);
  });

  it("제외(exclude) 키워드는 fit 에 들어가지 않는다", () => {
    expect(scoreLead({ ...base, matched: [K("서버실 공사", "exclude")] }).parts.fit).toBe(0);
  });

  it("키워드 weight 가 있으면 칸 기본값 대신 그 값을 쓴다", () => {
    expect(scoreLead({ ...base, matched: [K("x", "extended", 5)] }).parts.fit).toBe(5);
  });

  it("corroboration 은 4점에서 잘린다", () => {
    expect(scoreLead({ ...base, orgSignals90d: 7 }).parts.corroboration).toBe(4);
  });

  it("마감이 D-13 이면 deadline 0점, 같은 분기면 quarter 2점을 준다", () => {
    const d = scoreLead({
      ...base,
      draft: draft({ ...base.draft, nextDeadlineAt: parseKst("2026-11-04 10:00:00") }),
    });
    expect(d.parts.timing).toBe(4);
  });

  it("Q4 의 다음 분기는 다음 해 Q1 이다", () => {
    const q1 = scoreLead({ ...base, draft: draft({ ...base.draft, orderMonth: "2027-02" }) });
    expect(q1.parts.timing).toBe(5);
    const far = scoreLead({ ...base, draft: draft({ ...base.draft, orderMonth: "2027-07" }) });
    expect(far.parts.timing).toBe(3);
  });

  it("단계가 plan·prespec 이면 stage 2점, bid 이하면 0점이다", () => {
    expect(scoreLead({ ...base, draft: draft({ ...base.draft, stage: "plan" }) }).parts.stage).toBe(2);
    expect(scoreLead({ ...base, draft: draft({ ...base.draft, stage: "bid" }) }).parts.stage).toBe(0);
  });

  it("예산 구간: 5억 이상 2점, 1억 이상 1점, 미만 0점", () => {
    const budgetPart = (budget: number | null) =>
      scoreLead({ ...base, draft: draft({ ...base.draft, budget }) }).parts.budget;
    expect(budgetPart(500000000)).toBe(2);
    expect(budgetPart(100000000)).toBe(1);
    expect(budgetPart(99999999)).toBe(0);
    expect(budgetPart(null)).toBe(0);
  });
});
