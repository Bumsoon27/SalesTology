import { describe, expect, it } from "vitest";
import { isUuid } from "./ids";

describe("isUuid", () => {
  it("8-4-4-4-12 16진수만 받는다 (대소문자 무시)", () => {
    expect(isUuid("3f2b1c4d-0a1b-4c2d-8e3f-1234567890ab")).toBe(true);
    expect(isUuid("3F2B1C4D-0A1B-4C2D-8E3F-1234567890AB")).toBe(true);
  });
  it("모양이 다르거나 문자열이 아니면 거절", () => {
    expect(isUuid("3f2b1c4d-0a1b-4c2d-8e3f-1234567890a")).toBe(false);
    expect(isUuid(" 3f2b1c4d-0a1b-4c2d-8e3f-1234567890ab")).toBe(false);
    expect(isUuid("zzzzzzzz-0a1b-4c2d-8e3f-1234567890ab")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});
