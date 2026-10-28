import { describe, expect, it } from "vitest";
import { isLossReason, lossBreakdown } from "./loss";

describe("loss", () => {
  it("사유 검사", () => {
    expect(isLossReason("price")).toBe(true);
    expect(isLossReason("PRICE")).toBe(false);
    expect(isLossReason(null)).toBe(false);
  });
  it("사유별 건수·금액, 미입력은 맨 뒤, 기간 밖(lostIds 아님) 제외", () => {
    const rows = lossBreakdown(
      [
        { id: "a", status: "lost", amount: 100, lost_reason: "price" },
        { id: "b", status: "lost", amount: 300, lost_reason: "price" },
        { id: "c", status: "lost", amount: 50, lost_reason: null },
        { id: "d", status: "lost", amount: 900, lost_reason: "competitor" },
        { id: "e", status: "active", amount: 1, lost_reason: "price" },
        { id: "old", status: "lost", amount: 1, lost_reason: "budget" },
      ],
      new Set(["a", "b", "c", "d", "e"]),
    );
    expect(rows).toEqual([
      { reason: "price", count: 2, amount: 400 },
      { reason: "competitor", count: 1, amount: 900 },
      { reason: "unknown", count: 1, amount: 50 },
    ]);
  });
});
