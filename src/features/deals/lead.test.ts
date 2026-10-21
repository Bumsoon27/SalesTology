import { describe, expect, it } from "vitest";
import { toCreateDealArgs } from "./lead";

describe("toCreateDealArgs", () => {
  it("입찰은 경쟁입찰, 발주 시기는 그 달 1일, 예산은 원 단위 숫자", () => {
    const r = toCreateDealArgs({ name: " 차세대 서버 ", customer: "한빛은행", budget: "150,000,000원", orderMonth: "2026-12", procurement: "bid" });
    expect(r).toEqual({
      ok: true,
      args: {
        p_name: "차세대 서버",
        p_customer: "한빛은행",
        p_contract_type: "competitive",
        p_stage: "discovery",
        p_amount: 150000000,
        p_expected_contract_month: "2026-12-01",
        p_items: null,
        p_si: [],
        p_suppliers: [],
      },
    });
  });

  it("수의계약, 날짜까지 온 발주 시기, 예산 없음", () => {
    const r = toCreateDealArgs({ name: "유지보수", customer: "누리공사", orderMonth: "2027-03-15", procurement: "negotiated" });
    expect(r.ok && r.args).toMatchObject({ p_contract_type: "negotiated", p_expected_contract_month: "2027-03-01", p_amount: null });
  });

  it("잘못된 값은 이유와 함께 거부", () => {
    expect(toCreateDealArgs({ name: "", customer: "A", procurement: "bid" })).toMatchObject({ ok: false });
    expect(toCreateDealArgs({ name: "x", customer: "A", budget: "1.5억", procurement: "bid" })).toMatchObject({ ok: false });
    expect(toCreateDealArgs({ name: "x", customer: "A", orderMonth: "2026-13", procurement: "bid" })).toMatchObject({ ok: false });
    expect(toCreateDealArgs({ name: "x", customer: "A", procurement: "negotiated", stage: "bidding" })).toMatchObject({ ok: false });
  });
});
