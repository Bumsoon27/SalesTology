import { describe, expect, it } from "vitest";
import { displayOrgName, normalizeOrgName } from "./org";

describe("기관명 표준화", () => {
  it("법인 표기·공백·대소문자를 제거해 비교 키를 만든다", () => {
    expect(normalizeOrgName("(주)한빛 정보")).toBe("한빛정보");
    expect(normalizeOrgName("㈜한빛정보")).toBe("한빛정보");
    expect(normalizeOrgName("주식회사 한빛정보")).toBe("한빛정보");
    expect(normalizeOrgName("한빛정보 주식회사")).toBe("한빛정보");
    expect(normalizeOrgName("Hanbit  INFO")).toBe("hanbitinfo");
    expect(normalizeOrgName("국립순천대학교")).toBe("국립순천대학교");
  });

  it("표시용 이름은 법인 표기만 지우고 공백을 하나로 모은다", () => {
    expect(displayOrgName("  (주) 한빛   정보 ")).toBe("한빛 정보");
  });
});
