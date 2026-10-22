import { describe, expect, it } from "vitest";
import { parseAmount } from "./money";

describe("parseAmount", () => {
  it("숫자·콤마 문자열 허용", () => {
    expect(parseAmount("194700000")).toBe(194700000);
    expect(parseAmount("1,500,000")).toBe(1500000);
    expect(parseAmount(2500)).toBe(2500);
  });
  it("0·빈값·음수·비숫자는 null (미공개)", () => {
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount(0)).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(-5)).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});
