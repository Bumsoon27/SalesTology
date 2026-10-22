import { describe, expect, it } from "vitest";
import type { KeywordRow, LeadRow, RawItemRow } from "../server/rows";
import { dateToMonth, g2bKeywords, leadToStored, monthToDate, othersInOrg, rawRowToItem } from "./convert";

const raw = (o: Partial<RawItemRow>): RawItemRow => ({
  id: "r1",
  source: "g2b_bid",
  external_id: "R26BK001",
  version: 2,
  title: "서버 교체",
  org_name: "○○공단",
  org_code: "B552",
  org_id: "o1",
  chain_plan_no: null,
  chain_prespec_no: "P1",
  chain_bid_no: "R26BK001",
  budget: "150000000",
  published_at: "2026-10-20T00:00:00+00:00",
  deadline_at: "2026-10-25T14:59:00+00:00",
  deadline_type: "bid_close",
  url: "https://x",
  match_text: "서버 교체 IBM",
  payload: null,
  fetched_at: "2026-10-22T00:00:00+00:00",
  ...o,
});

describe("rawRowToItem", () => {
  it("DB 행 → 정규화 항목", () => {
    const it = rawRowToItem(raw({}));
    expect(it).toMatchObject({
      source: "g2b_bid",
      externalId: "R26BK001",
      version: 2,
      orgName: "○○공단",
      chainPrespecNo: "P1",
      budget: 150000000,
      deadlineType: "bid_close",
      orderMonth: null,
      matchText: "서버 교체 IBM",
    });
  });

  it("발주계획 발주월은 원본에서 복원", () => {
    const it = rawRowToItem(raw({ source: "g2b_plan", payload: { orderYear: "2026", orderMnth: "3" } }));
    expect(it.orderMonth).toBe("2026-03");
    expect(rawRowToItem(raw({ source: "g2b_plan", payload: null })).orderMonth).toBeNull();
    // payload 대신 꺼낸 값으로도
    expect(rawRowToItem(raw({ source: "g2b_plan", order_year: "2026", order_mnth: "11" })).orderMonth).toBe("2026-11");
  });

  it("예산 0·빈값은 미공개", () => {
    expect(rawRowToItem(raw({ budget: null })).budget).toBeNull();
    expect(rawRowToItem(raw({ budget: 0 })).budget).toBeNull();
  });
});

describe("발주월 변환", () => {
  it("YYYY-MM ↔ YYYY-MM-01", () => {
    expect(monthToDate("2026-10")).toBe("2026-10-01");
    expect(monthToDate(null)).toBeNull();
    expect(monthToDate("2026-1")).toBeNull();
    expect(dateToMonth("2026-10-01")).toBe("2026-10");
    expect(dateToMonth(null)).toBeNull();
  });
});

describe("othersInOrg", () => {
  it("같은 기관의 다른 리드 수 (자기 자신 제외)", () => {
    const m = new Map([["o1", new Set(["a", "b", "c"])]]);
    expect(othersInOrg(m, "o1", "a")).toBe(2);
    expect(othersInOrg(m, "o1", "z")).toBe(3);
    expect(othersInOrg(m, null, "a")).toBe(0);
    expect(othersInOrg(m, "o2", "a")).toBe(0);
  });
});

describe("g2bKeywords", () => {
  it("조달 출처가 켜진 키워드만", () => {
    const rows: KeywordRow[] = [
      { id: "k1", term: "서버", tier: "core", weight: null, active: true, sources: ["g2b"] },
      { id: "k2", term: "AI", tier: "core", weight: null, active: true, sources: ["news"] },
    ];
    expect(g2bKeywords(rows).map((k) => k.id)).toEqual(["k1"]);
  });
});

describe("leadToStored", () => {
  it("DB 리드 → 갱신 규칙 입력", () => {
    const l = { status: "on_hold", stage: "prespec", next_deadline_at: null, touched_at: "t", hidden: false, has_new_progress: false, keyword_mismatch: true } as LeadRow;
    expect(leadToStored(l)).toEqual({ status: "on_hold", stage: "prespec", nextDeadlineAt: null, touchedAt: "t", hidden: false, hasNewProgress: false, keywordMismatch: true });
  });
});
