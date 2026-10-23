import { describe, expect, it } from "vitest";
import { countDeals, type DealRef } from "./count";

const deal = (id: string, o: Partial<DealRef> = {}): DealRef => ({ id, deleted_at: null, owner_id: "me", source_ref: null, ...o });

describe("countDeals", () => {
  it("고객사·관계사 사업을 합치고 같은 사업은 한 번, 삭제된 사업은 뺀다", () => {
    const r = countDeals(
      [deal("a"), deal("b", { owner_id: "dj", source_ref: "sos_lead:1" }), deal("x", { deleted_at: "2026-10-01" })],
      [deal("a"), deal("c", { owner_id: "dj" }), null],
      "me",
    );
    expect(r).toEqual({ dealCount: 3, myDealCount: 1, sosDealCount: 1 });
  });

  it("사업이 없으면 모두 0", () => {
    expect(countDeals([], [], "me")).toEqual({ dealCount: 0, myDealCount: 0, sosDealCount: 0 });
  });
});
