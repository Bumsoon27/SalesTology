import { describe, expect, it } from "vitest";
import { parseKst } from "../lib/date";
import type { NormalizedItem } from "../types";
import { chainKeyOf, groupChains, resolveChainKey, toLeadDraft } from "./chain";

function item(o: Partial<NormalizedItem>): NormalizedItem {
  return {
    source: "g2b_bid",
    externalId: "X",
    version: 0,
    title: "t",
    orgName: "기관",
    orgCode: null,
    chainPlanNo: null,
    chainPrespecNo: null,
    chainBidNo: null,
    budget: null,
    publishedAt: null,
    deadlineAt: null,
    deadlineType: null,
    orderMonth: null,
    url: null,
    matchText: "",
    payload: {},
    ...o,
  };
}

const plan = item({ source: "g2b_plan", externalId: "P1", chainPlanNo: "P1", orderMonth: "2026-12", budget: null, title: "2027 전산장비 도입" });
const pre = item({ source: "g2b_prespec", externalId: "S1", chainPrespecNo: "S1", budget: 320000000, deadlineAt: parseKst("2026-10-28 18:00:00"), deadlineType: "prespec_opinion", title: "백업장비 교체" });
const bid0 = item({ source: "g2b_bid", externalId: "B1", version: 0, chainBidNo: "B1", chainPrespecNo: "S1", chainPlanNo: "P1", title: "백업장비 교체 구매" });
const bid1 = { ...bid0, version: 1, title: "백업장비 교체 구매(정정)" };

describe("chain", () => {
  it("계획·사전규격·입찰을 한 묶음으로, 정정공고는 최신만", () => {
    const groups = groupChains([plan, pre, bid0, bid1]);
    expect(groups).toHaveLength(1);
    expect(groups[0].filter((i) => i.source === "g2b_bid")).toHaveLength(1);
    expect(chainKeyOf(groups[0])).toBe("plan:P1");
    const d = toLeadDraft(groups[0], "plan:P1", "2026-10-22");
    expect(d).toMatchObject({ stage: "bid", title: "백업장비 교체 구매(정정)", budget: 320000000, orderMonth: "2026-12", nextDeadlineType: "prespec_opinion" });
    expect(d.items).toBe(groups[0]);
  });

  it("기존 리드 키가 있으면 그 키를 쓴다", () => {
    expect(resolveChainKey([pre], new Map([["S1", "plan:P1"]]))).toBe("plan:P1");
    expect(resolveChainKey([pre], new Map())).toBe("prespec:S1");
  });

  it("번호가 다르면 별개 묶음, 번호 없는 항목은 단독", () => {
    expect(groupChains([pre, item({ source: "g2b_prespec", externalId: "S2", chainPrespecNo: "S2" })])).toHaveLength(2);
    const a = item({ externalId: "A" });
    const b = item({ externalId: "B" });
    expect(groupChains([a, b])).toHaveLength(2);
  });

  it("다른 필드의 같은 문자열은 충돌하지 않는다", () => {
    const x = item({ source: "g2b_plan", externalId: "1", chainPlanNo: "1" });
    const y = item({ source: "g2b_bid", externalId: "2", chainBidNo: "1" });
    expect(groupChains([x, y])).toHaveLength(2);
  });

  it("지난 마감은 건너뛰고 없으면 null", () => {
    const d = toLeadDraft([pre], "prespec:S1", "2026-11-01");
    expect(d.nextDeadlineAt).toBeNull();
    expect(d.nextDeadlineType).toBeNull();
  });

  it("orgCode 는 최고 단계에 없으면 묶음의 첫 non-null", () => {
    const p = item({ source: "g2b_plan", externalId: "P", chainPlanNo: "P", orgCode: "C1" });
    const b = item({ source: "g2b_bid", externalId: "B", chainBidNo: "B", chainPlanNo: "P" });
    expect(toLeadDraft([p, b], "plan:P", "2026-10-22").orgCode).toBe("C1");
  });
});
