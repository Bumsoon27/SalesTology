import { describe, expect, it } from "vitest";
import { MONEY_HINT, toDealInfoPatch } from "./edit";

const base = { name: " 차세대 서버 ", amount: "150,000,000", gp: "15,000,000원", contractType: "competitive", periodStart: "", periodEnd: "", items: " " };

describe("toDealInfoPatch", () => {
  it("금액은 원 단위 숫자로, 빈 값은 null", () => {
    expect(toDealInfoPatch(base, "discovery")).toEqual({
      ok: true,
      patch: { name: "차세대 서버", amount: 150000000, gp: 15000000, contract_type: "competitive", period_start: null, period_end: null, items: null },
    });
    expect(toDealInfoPatch({ ...base, amount: "", gp: "-3000000" }, "discovery")).toMatchObject({ ok: true, patch: { amount: null, gp: -3000000 } });
  });

  it("잘못된 값은 칸별 오류", () => {
    expect(toDealInfoPatch({ ...base, name: "", amount: "15%" }, "discovery")).toEqual({
      ok: false,
      fieldErrors: { name: "사업명을 입력하세요.", amount: MONEY_HINT },
    });
    expect(toDealInfoPatch({ ...base, amount: "1.5억", gp: "1500만" }, "discovery")).toMatchObject({ ok: true, patch: { amount: 150_000_000, gp: 15_000_000 } });
    expect(toDealInfoPatch({ ...base, periodStart: "2026-12-01", periodEnd: "2026-11-01" }, "discovery")).toMatchObject({ ok: false, fieldErrors: { periodEnd: expect.any(String) } });
  });

  it("입찰 단계 사업은 수의계약으로 바꿀 수 없다", () => {
    expect(toDealInfoPatch({ ...base, contractType: "negotiated" }, "bidding")).toMatchObject({ ok: false, fieldErrors: { contractType: expect.any(String) } });
    expect(toDealInfoPatch({ ...base, contractType: "negotiated" }, "proposal")).toMatchObject({ ok: true });
  });
});
