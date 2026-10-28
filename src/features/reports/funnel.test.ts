import { describe, expect, it } from "vitest";
import { funnel } from "./funnel";
import type { DealEvent, ReportDeal } from "./report";

const deal = (o: Partial<ReportDeal>): ReportDeal => ({ id: "d", name: "", stage: "discovery", status: "active", amount: 1, created_at: "2026-05-01T00:00:00Z", owner_id: "u", owner: "", customer: { name: "" }, ...o });
const ev = (o: Partial<DealEvent>): DealEvent => ({ deal_id: "d", action: "stage_change", before: null, after: null, created_at: "2026-06-01T00:00:00Z", ...o });

describe("funnel", () => {
  it("가장 높이 도달한 단계로 센다 (되돌림·실주 포함), 기간 밖 사업 제외", () => {
    const rows = funnel(
      [
        deal({ id: "a", stage: "billing" }),
        deal({ id: "b", stage: "quoting", status: "lost" }), // 이력상 협상까지 갔다가 되돌림
        deal({ id: "c", stage: "discovery" }),
        deal({ id: "d", stage: "proposal" }),
        deal({ id: "old", stage: "won", created_at: "2025-01-01T00:00:00Z" }),
      ],
      [ev({ deal_id: "b", before: { stage: "negotiation" }, after: { stage: "quoting" } })],
      "2026-01-01",
    );
    expect(rows.map((r) => [r.stage, r.reached, r.pct, r.stepPct])).toEqual([
      ["discovery", 4, 100, null],
      ["quoting", 3, 75, 75],
      ["proposal", 3, 75, 100],
      ["negotiation", 2, 50, 67],
      ["bidding", 1, 25, 50],
      ["won", 1, 25, 100],
    ]);
  });
});
