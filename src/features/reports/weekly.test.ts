import { describe, expect, it } from "vitest";
import type { DealEvent, ReportDeal } from "./report";
import { advances, weekStats, weeks } from "./weekly";

const deal = (o: Partial<ReportDeal>): ReportDeal => ({
  id: "d",
  name: "사업",
  stage: "proposal",
  status: "active",
  amount: 100,
  gp: 10,
  created_at: "2026-01-05T01:00:00Z",
  owner_id: "u1",
  owner: "김영업",
  customer: { name: "한빛은행" },
  ...o,
});
const ev = (o: Partial<DealEvent>): DealEvent => ({ deal_id: "d", action: "stage_change", before: null, after: null, created_at: "2026-10-27T01:00:00Z", ...o });

describe("weeks", () => {
  it("월요일~오늘, 지난주는 같은 일수", () => {
    // 2026-10-28 = 수요일
    expect(weeks("2026-10-28")).toEqual({ thisWeek: { from: "2026-10-26", to: "2026-10-28" }, lastWeek: { from: "2026-10-19", to: "2026-10-21" } });
    // 월요일이면 하루, 일요일이면 7일
    expect(weeks("2026-10-26").thisWeek).toEqual({ from: "2026-10-26", to: "2026-10-26" });
    expect(weeks("2026-11-01").thisWeek).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });
});

describe("advances", () => {
  const w = { from: "2026-10-26", to: "2026-10-28" };
  it("앞으로 나아간 것만, 한 주에 여러 번이면 합친다, 되돌아갔으면 뺀다", () => {
    const deals = [deal({ id: "a", stage: "negotiation" }), deal({ id: "b", stage: "discovery" }), deal({ id: "c", stage: "proposal" })];
    const events = [
      ev({ deal_id: "a", before: { stage: "quoting" }, after: { stage: "proposal" } }),
      ev({ deal_id: "a", before: { stage: "proposal" }, after: { stage: "negotiation" }, created_at: "2026-10-28T01:00:00Z" }),
      ev({ deal_id: "b", before: { stage: "discovery" }, after: { stage: "quoting" } }), // 이후 되돌림 → 제외
      ev({ deal_id: "c", before: { stage: "negotiation" }, after: { stage: "proposal" } }), // 후퇴 → 제외
      ev({ deal_id: "c", before: { stage: "discovery" }, after: { stage: "quoting" }, created_at: "2026-10-20T01:00:00Z" }), // 지난주
    ];
    expect(advances(deals, events, w)).toEqual([{ dealId: "a", name: "사업", customer: "한빛은행", from: "quoting", to: "negotiation", on: "2026-10-28" }]);
  });

  it("weekStats — 수주·실주·신규·진전 건수", () => {
    const deals = [deal({ id: "a", created_at: "2026-10-26T00:30:00Z" }), deal({ id: "b", created_at: "2026-10-25T14:30:00Z" })]; // b = 서울 10-25 23:30
    const s = weekStats(
      deals,
      [ev({ deal_id: "a", before: { stage: "quoting" }, after: { stage: "proposal" } })],
      [{ dealId: "x", name: "", customer: "", ownerId: "u1", owner: "", on: "2026-10-27", amount: 500, gp: null }],
      [{ dealId: "y", ownerId: "u1", on: "2026-10-20" }],
      w,
    );
    expect(s).toEqual({ won: 1, wonAmount: 500, lost: 0, created: 1, advanced: 1 });
  });
});
