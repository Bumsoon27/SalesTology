import { describe, expect, it } from "vitest";
import { needsRenewal, nextPeriod, renewalName } from "./renewal";

const today = "2026-10-28";

describe("needsRenewal", () => {
  it("수주 이후 사업의 계약 종료 90일 안(끝난 뒤 30일까지)만, 이미 갱신 사업이 있으면 아님", () => {
    expect(needsRenewal({ stage: "billing", period_end: "2026-12-31" }, today, false)).toBe(64);
    expect(needsRenewal({ stage: "billing", period_end: "2026-10-01" }, today, false)).toBe(-27);
    expect(needsRenewal({ stage: "billing", period_end: "2027-06-30" }, today, false)).toBeNull();
    expect(needsRenewal({ stage: "billing", period_end: "2026-09-01" }, today, false)).toBeNull();
    expect(needsRenewal({ stage: "proposal", period_end: "2026-12-31" }, today, false)).toBeNull();
    expect(needsRenewal({ stage: "billing", period_end: "2026-12-31" }, today, true)).toBeNull();
    expect(needsRenewal({ stage: "billing", period_end: null }, today, false)).toBeNull();
  });
});

describe("nextPeriod·renewalName", () => {
  it("종료 다음 날부터 1년", () => {
    expect(nextPeriod("2026-12-31")).toEqual({ start: "2027-01-01", end: "2027-12-31" });
    expect(nextPeriod("2027-11-30")).toEqual({ start: "2027-12-01", end: "2028-11-30" });
    expect(nextPeriod("2028-02-28")).toEqual({ start: "2028-02-29", end: "2029-02-27" });
  });
  it("이름에 갱신 연도, 이전 '(…갱신)' 표기는 바꿔 쓴다", () => {
    expect(renewalName("유지보수 계약", "2027-01-01")).toBe("유지보수 계약 (2027 갱신)");
    expect(renewalName("유지보수 계약 (2027 갱신)", "2028-01-01")).toBe("유지보수 계약 (2028 갱신)");
  });
});
