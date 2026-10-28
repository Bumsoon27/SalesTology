import { describe, expect, it } from "vitest";
import { attainment, elapsedPct, targetFor, validMonth } from "./targets";

const targets = [
  { month: "2026-10-01", amount: 300 },
  { month: "2026-11-01", amount: 300 },
  { month: "2026-12-01", amount: 400 },
  { month: "2026-03-01", amount: 100 },
];

describe("targetFor", () => {
  it("기간의 월 목표를 더한다, 없으면 null", () => {
    expect(targetFor(targets, { from: "2026-10-01", to: "2026-10-28", label: "10월" })).toBe(300);
    expect(targetFor(targets, { from: "2026-10-01", to: "2026-12-31", label: "4분기" })).toBe(1000);
    expect(targetFor(targets, { from: "2026-01-01", to: "2026-12-31", label: "2026년" })).toBe(1100);
    expect(targetFor(targets, { from: "2026-07-01", to: "2026-09-30", label: "3분기" })).toBeNull();
  });
});

describe("attainment·elapsedPct·validMonth", () => {
  it("달성률, 경과율, 월 형식", () => {
    expect(attainment(150, 300)).toBe(50);
    expect(attainment(450, 300)).toBe(150);
    expect(attainment(10, null)).toBeNull();
    expect(attainment(10, 0)).toBeNull();
    expect(elapsedPct({ from: "2026-10-01", to: "2026-10-28", label: "" }, "2026-10-16", "2026-10-31")).toBe(52);
    expect(validMonth("2026-10-01")).toBe(true);
    expect(validMonth("2026-13-01")).toBe(false);
    expect(validMonth("2026-10-02")).toBe(false);
  });
});
