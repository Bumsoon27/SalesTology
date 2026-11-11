import { describe, expect, it } from "vitest";
import { convertedLeadPatch, orderMonthOf, toLeadToDealInput } from "./convert";

describe("toLeadToDealInput", () => {
  const L = { id: "L1", title: "백업장비 교체", orgName: "(주)한빛", companyId: null, budget: 320000000, orderMonth: "2027-01", stage: "prespec" as const, assigneeId: "u1" };

  it("리드 값을 A 사업 입력으로 바꾼다", () => {
    expect(toLeadToDealInput({ id: "L1", title: "백업장비 교체", orgName: "(주)한빛", companyId: null, budget: 320000000, orderMonth: "2027-01", stage: "prespec", assigneeId: "u1" })).toEqual({
      name: "백업장비 교체",
      customer: "한빛",
      customerId: null,
      budget: 320000000,
      orderMonth: "2027-01",
      procurement: "bid",
      ownerId: "u1",
      sourceRef: "sos_lead:L1",
    });
  });

  it("기존 고객이면 customerId, 담당자가 없으면 ownerId null", () => {
    expect(toLeadToDealInput({ ...L, companyId: "c1" }).customerId).toBe("c1");
    expect(toLeadToDealInput({ ...L, assigneeId: null }).ownerId).toBeNull();
  });
});

describe("orderMonthOf", () => {
  it("DB date 를 YYYY-MM 으로", () => {
    expect(orderMonthOf("2027-01-01")).toBe("2027-01");
    expect(orderMonthOf("2027-01")).toBe("2027-01");
    expect(orderMonthOf(null)).toBeNull();
    expect(orderMonthOf("이상한 값")).toBeNull();
  });
});

describe("convertedLeadPatch", () => {
  const now = new Date("2026-10-23T06:00:00Z");

  it("담당이 비어 있으면 전환한 사람을 리드 담당으로 남긴다", () => {
    expect(convertedLeadPatch({ assigneeId: null, touchedAt: null }, "d1", "u9", now)).toEqual({
      status: "converted",
      converted_deal_id: "d1",
      assignee_id: "u9",
      touched_at: "2026-10-23T06:00:00.000Z",
    });
  });

  it("이미 담당이 있으면 바꾸지 않고, 처음 손댄 시각도 덮지 않는다", () => {
    expect(convertedLeadPatch({ assigneeId: "u1", touchedAt: "2026-10-22T00:00:00Z" }, "d1", "u9", now)).toEqual({
      status: "converted",
      converted_deal_id: "d1",
    });
  });
});
