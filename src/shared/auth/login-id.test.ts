import { describe, expect, it } from "vitest";
import { isStrongPassword, isValidLoginId, toAuthEmail } from "./login-id";

describe("toAuthEmail", () => {
  it("ID를 내부 이메일로 바꾼다", () => {
    expect(toAuthEmail("sbbae")).toBe("sbbae@salestology.local");
  });

  it("대문자·공백은 정규화한다", () => {
    expect(toAuthEmail("  SBBae ")).toBe("sbbae@salestology.local");
  });

  it("규칙에 맞지 않는 ID는 거부한다", () => {
    expect(() => toAuthEmail("abc")).toThrow();
    expect(() => toAuthEmail("sb-bae")).toThrow();
  });
});

describe("isValidLoginId", () => {
  it("4자와 20자 경계", () => {
    expect(isValidLoginId("abcd")).toBe(true);
    expect(isValidLoginId("a".repeat(20))).toBe(true);
    expect(isValidLoginId("a".repeat(21))).toBe(false);
  });
});

describe("isStrongPassword", () => {
  it("영문·숫자·특수문자 8자 이상만 통과", () => {
    expect(isStrongPassword("abcd123!")).toBe(true);
    expect(isStrongPassword("abcd1234")).toBe(false);
    expect(isStrongPassword("ab1!")).toBe(false);
  });
});
