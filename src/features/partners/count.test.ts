import { describe, expect, it } from "vitest";
import { countDeals, inScope, toScope, type DealRef } from "./count";

describe("inScope", () => {
  const mineOnly = { dealCount: 1, myDealCount: 1, sosDealCount: 0 };
  const sosOnly = { dealCount: 1, myDealCount: 0, sosDealCount: 1 };
  const none = { dealCount: 0, myDealCount: 0, sosDealCount: 0 };
  it("전체는 사업이 없는 회사도, 내 사업·SOS 는 해당 사업이 있는 회사만", () => {
    expect([mineOnly, sosOnly, none].map((p) => inScope(p, "all"))).toEqual([true, true, true]);
    expect([mineOnly, sosOnly, none].map((p) => inScope(p, "mine"))).toEqual([true, false, false]);
    expect([mineOnly, sosOnly, none].map((p) => inScope(p, "sos"))).toEqual([false, true, false]);
  });
  it("모르는 값은 전체", () => {
    expect([toScope("mine"), toScope("sos"), toScope("x"), toScope(null)]).toEqual(["mine", "sos", "all", "all"]);
  });
});

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
