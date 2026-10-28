import { describe, expect, it } from "vitest";
import { byOwner, computeOutcomes, monthly, periods, salesCycle, totals, winRate, type DealEvent, type ReportDeal } from "./report";

const deal = (o: Partial<ReportDeal>): ReportDeal => ({
  id: "d",
  name: "사업",
  stage: "won",
  status: "active",
  amount: 100,
  gp: 10,
  created_at: "2026-01-05T01:00:00Z",
  owner_id: "u1",
  owner: "김영업",
  customer: { name: "한빛은행" },
  ...o,
});
const ev = (o: Partial<DealEvent>): DealEvent => ({ deal_id: "d", action: "stage_change", before: null, after: null, created_at: "2026-01-01T00:00:00Z", ...o });

describe("computeOutcomes", () => {
  it("수주 시점 = 처음 수주 이후 단계에 들어간 때 (서울 날짜), 이후 단계 이동은 무시", () => {
    const { wins } = computeOutcomes(
      [deal({ id: "a", stage: "billing" })],
      [
        ev({ deal_id: "a", before: { stage: "negotiation" }, after: { stage: "won" }, created_at: "2026-09-30T16:00:00Z" }), // 서울 10-01
        ev({ deal_id: "a", before: { stage: "won" }, after: { stage: "fulfillment" }, created_at: "2026-10-10T00:00:00Z" }),
      ],
    );
    expect(wins[0]).toMatchObject({ dealId: "a", on: "2026-10-01", amount: 100, gp: 10 });
  });

  it("처음부터 수주로 등록하면 등록 시점, 이력이 없으면 등록일", () => {
    const { wins } = computeOutcomes(
      [deal({ id: "a" }), deal({ id: "b", created_at: "2026-03-03T03:00:00Z" })],
      [ev({ deal_id: "a", action: "create", after: { stage: "won" }, created_at: "2026-02-02T03:00:00Z" })],
    );
    expect(Object.fromEntries(wins.map((w) => [w.dealId, w.on]))).toEqual({ a: "2026-02-02", b: "2026-03-03" });
  });

  it("지금 수주 전 단계·실주는 수주가 아니고, 실주는 실주 시점으로", () => {
    const { wins, losses } = computeOutcomes(
      [deal({ id: "a", stage: "proposal" }), deal({ id: "b", status: "lost" })],
      [ev({ deal_id: "b", action: "update", after: { status: "lost" }, created_at: "2026-04-04T00:00:00Z" })],
    );
    expect(wins).toEqual([]);
    expect(losses).toEqual([{ dealId: "b", ownerId: "u1", on: "2026-04-04" }]);
  });
});

describe("기간·집계", () => {
  const today = "2026-10-28";
  const wins = [
    { dealId: "1", name: "a", customer: "x", ownerId: "u1", owner: "김", on: "2026-10-03", amount: 300, gp: 30 },
    { dealId: "2", name: "b", customer: "x", ownerId: "u2", owner: "서", on: "2026-08-15", amount: 200, gp: null },
    { dealId: "3", name: "c", customer: "x", ownerId: "u1", owner: "김", on: "2025-12-01", amount: 999, gp: 1 },
  ];

  it("이번 달·분기·올해", () => {
    const p = periods(today);
    expect(p.month).toMatchObject({ from: "2026-10-01", to: today, label: "10월" });
    expect(p.quarter).toMatchObject({ from: "2026-10-01", label: "4분기" });
    expect(totals(wins, p.year)).toEqual({ count: 2, amount: 500, gp: 30, gpRate: 10 });
    expect(totals(wins, p.month)).toMatchObject({ count: 1, amount: 300 });
  });

  it("최근 12개월 (빈 달 0), 영업대표별, 승률", () => {
    const rows = monthly(wins, today);
    expect(rows).toHaveLength(12);
    expect(rows[0].month).toBe("2025-11");
    expect(rows.find((r) => r.month === "2025-12")?.amount).toBe(999);
    expect(rows.find((r) => r.month === "2026-09")?.count).toBe(0);
    expect(byOwner(wins, periods(today).year).map((r) => [r.owner, r.amount])).toEqual([
      ["김", 300],
      ["서", 200],
    ]);
    expect(winRate(wins, [{ dealId: "9", ownerId: "u1", on: "2026-09-01" }], "2026-07-30", today)).toEqual({ rate: 67, won: 2, lost: 1 });
    expect(winRate([], [], "2026-01-01", today).rate).toBeNull();
  });
});

describe("salesCycle", () => {
  it("등록 → 수주 일수의 평균·중앙값, 기간 밖 제외", () => {
    const w = (dealId: string, on: string) => ({ dealId, name: "", customer: "", ownerId: "u", owner: "", on, amount: 1, gp: null });
    const deals = [
      { id: "a", created_at: "2026-09-01T00:00:00Z" },
      { id: "b", created_at: "2026-09-21T00:00:00Z" },
      { id: "c", created_at: "2026-10-01T00:00:00Z" },
      { id: "x", created_at: "2026-01-01T00:00:00Z" },
    ];
    expect(salesCycle([w("a", "2026-10-01"), w("b", "2026-10-01"), w("c", "2026-10-31"), w("x", "2026-02-01")], deals, "2026-08-01", "2026-10-31")).toEqual({ avg: 23, median: 30, count: 3 });
    expect(salesCycle([], deals, "2026-01-01", "2026-12-31")).toBeNull();
    // 처음부터 수주로 등록한 사업은 뺀다
    const created = [{ deal_id: "a", action: "create", before: null, after: { stage: "won" }, created_at: "2026-09-01T00:00:00Z" }];
    expect(salesCycle([w("a", "2026-10-01"), w("b", "2026-10-01")], deals, "2026-08-01", "2026-10-31", created)).toEqual({ avg: 10, median: 10, count: 1 });
  });
});
