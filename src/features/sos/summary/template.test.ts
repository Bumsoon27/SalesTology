import { describe, expect, it } from "vitest";
import { formatWon, templateSummary } from "./template";

describe("templateSummary", () => {
  it("전체 항목", () => {
    expect(templateSummary({ orgName: "○○공단", title: "백업장비 교체", orderMonth: "2027-01", budget: 320000000, nextDeadlineType: "prespec_opinion", daysLeft: 6, keywords: ["LTO드라이브", "백업테이프"], orgSignals: 1 }))
      .toBe("○○공단이 2027년 1월에 백업장비 교체를 발주할 예정입니다. 예산 3.2억. 사전규격 의견 마감 D-6. 일치 키워드: LTO드라이브, 백업테이프. 같은 기관 시그널 1건.");
  });
  it("최소 항목", () => {
    expect(templateSummary({ orgName: "국립순천대학교", title: "서버 구매", orderMonth: null, budget: null, nextDeadlineType: null, daysLeft: null, keywords: ["서버"], orgSignals: 0 }))
      .toBe("국립순천대학교가 서버 구매를 발주할 예정입니다. 일치 키워드: 서버.");
  });
  it("받침 있는 말과 입찰 마감", () => {
    expect(templateSummary({ orgName: "한국철도공사", title: "스토리지 도입", orderMonth: null, budget: null, nextDeadlineType: "bid_close", daysLeft: 3, keywords: ["스토리지"], orgSignals: 0 }))
      .toBe("한국철도공사가 스토리지 도입을 발주할 예정입니다. 입찰 마감 D-3. 일치 키워드: 스토리지.");
    expect(templateSummary({ orgName: "서울시청", title: "서버 구축", orderMonth: null, budget: null, nextDeadlineType: null, daysLeft: null, keywords: ["서버"], orgSignals: 0 }))
      .toContain("서울시청이 서버 구축을 ");
    expect(templateSummary({ orgName: "KT", title: "서버 도입", orderMonth: null, budget: null, nextDeadlineType: null, daysLeft: null, keywords: [], orgSignals: 0 }))
      .toContain("KT가 ");
  });
  it("영문으로 끝나는 이름은 끝 글자의 한국어 읽기로 조사를 고른다", () => {
    const base = { orderMonth: null, budget: null, nextDeadlineType: null, daysLeft: null, keywords: [], orgSignals: 0 };
    expect(templateSummary({ ...base, orgName: "한전KDN", title: "서버 도입" })).toContain("한전KDN이 ");
    expect(templateSummary({ ...base, orgName: "한국IBM", title: "서버 도입" })).toContain("한국IBM이 ");
    expect(templateSummary({ ...base, orgName: "SKC&C", title: "서버 도입" })).toContain("SKC&C가 ");
    expect(templateSummary({ ...base, orgName: "LG", title: "서버 도입" })).toContain("LG가 ");
    expect(templateSummary({ ...base, orgName: "기관", title: "통합 HPC" })).toContain("통합 HPC를 ");
    expect(templateSummary({ ...base, orgName: "기관", title: "백업 SAN" })).toContain("백업 SAN을 ");
    expect(templateSummary({ ...base, orgName: "기관", title: "CTI 서버(ivr)" })).toContain("CTI 서버(ivr)를 ");
    expect(templateSummary({ ...base, orgName: "기관", title: "통합 erp" })).toContain("통합 erp를 ");
    expect(templateSummary({ ...base, orgName: "기관", title: "web ftp gw lan" })).toContain("web ftp gw lan을 ");
  });
});

describe("formatWon", () => {
  it("단위", () => {
    expect(formatWon(null)).toBe("미공개");
    expect(formatWon(45000000)).toBe("4,500만");
    expect(formatWon(320000000)).toBe("3.2억");
    expect(formatWon(100000000)).toBe("1억");
    expect(formatWon(99_999_999)).toBe("1억");
    expect(formatWon(9_999)).toBe("9,999원");
    expect(formatWon(123_456_789_000_000)).toBe("1,234,567.9억");
    expect(formatWon(5000)).toBe("5,000원");
  });
});
