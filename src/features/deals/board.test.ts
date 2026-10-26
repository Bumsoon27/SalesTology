import { describe, expect, it } from "vitest";
import { buildBoard, moveError } from "./board";
import type { DealRow } from "./types";

const today = "2026-10-26";
const deal = (o: Partial<DealRow>): DealRow => ({
  id: "d",
  name: "사업",
  stage: "discovery",
  status: "active",
  amount: null,
  gp: null,
  last_activity_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
  contract_type: "competitive",
  customer: { id: "c", name: "한빛은행" },
  deal_parties: [],
  deal_tasks: [],
  issues: [],
  ...o,
});

describe("moveError", () => {
  it("수의계약은 입찰로 못 옮긴다, 나머지는 가능", () => {
    expect(moveError({ stage: "proposal", contractType: "negotiated" }, "bidding")).toContain("수의계약");
    expect(moveError({ stage: "proposal", contractType: "competitive" }, "bidding")).toBeNull();
    expect(moveError({ stage: "proposal", contractType: "negotiated" }, "won")).toBeNull();
  });
});

describe("buildBoard", () => {
  it("8개 단계 열, 진행·보류만, 열 합계·가중(보류 제외), 급한 순", () => {
    const cols = buildBoard(
      [
        deal({ id: "a", stage: "proposal", amount: 100, gp: 10 }),
        deal({ id: "b", stage: "proposal", amount: 300, issues: [{ id: "i", title: "x", status: "open" }] }),
        deal({ id: "c", stage: "proposal", amount: 500, status: "on_hold" }),
        deal({ id: "d", stage: "won", amount: 50, status: "lost" }),
      ],
      today,
    );
    expect(cols).toHaveLength(8);
    const p = cols.find((c) => c.stage === "proposal")!;
    expect(p.cards.map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(p).toMatchObject({ total: 400, weighted: 160, probability: 40 });
    expect(p.cards.find((c) => c.id === "a")).toMatchObject({ gpRate: 10, idleDays: 1, onHold: false });
    expect(cols.find((c) => c.stage === "won")!.cards).toHaveLength(0);
  });
});
