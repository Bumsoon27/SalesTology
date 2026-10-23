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

  it("이름 중간의 표기는 건드리지 않는다", () => {
    expect(normalizeOrgName("대한주식회사관리")).toBe("대한주식회사관리");
    expect(displayOrgName("한빛(주)정보")).toBe("한빛(주)정보");
  });

  it("앞뒤 표기를 모두 제거한다", () => {
    expect(displayOrgName("(주) 한빛 주식회사")).toBe("한빛");
  });

  it("표기만 있는 이름은 원문을 유지한다", () => {
    expect(normalizeOrgName("㈜")).toBe("㈜");
    expect(displayOrgName(" (주) ")).toBe("(주)");
  });
});
