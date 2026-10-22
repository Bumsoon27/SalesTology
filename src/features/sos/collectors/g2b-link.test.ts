import { describe, expect, it } from "vitest";
import { buildLinkQuery, linkBizOrder, linkEndpoint, pickPlanNo } from "./g2b-link";

describe("계약과정통합공개 연결", () => {
  it("업무별 경로", () => {
    expect(linkEndpoint("Thng")).toBe("/ao/CntrctProcssIntgOpenService/getCntrctProcssIntgOpenThng");
    expect(linkEndpoint("Servc")).toBe("/ao/CntrctProcssIntgOpenService/getCntrctProcssIntgOpenServc");
  });

  it("사전규격 번호로 조회는 inqryDiv=2 (실측: 1 이면 0건)", () => {
    expect(buildLinkQuery("R26BD00012345")).toEqual({
      inqryDiv: "2",
      bfSpecRgstNo: "R26BD00012345",
      type: "json",
      pageNo: "1",
      numOfRows: "10",
    });
  });

  it("응답에서 발주계획 번호 찾기", () => {
    expect(pickPlanNo({ ok: true, totalCount: 1, items: [{ orderPlanUntyNo: " R26DD0001 " }] })).toBe("R26DD0001");
    expect(pickPlanNo({ ok: true, totalCount: 2, items: [{ orderPlanUntyNo: "" }, { orderPlanUntyNo: "R26DD0002" }] })).toBe("R26DD0002");
    expect(pickPlanNo({ ok: true, totalCount: 0, items: [] })).toBeNull();
    expect(pickPlanNo({ ok: false, code: "08", message: "x" })).toBeNull();
  });
});

describe("linkBizOrder", () => {
  it("사전규격 원본의 업무구분으로 조회할 업무를 고른다", () => {
    expect(linkBizOrder({ bsnsDivNm: "물품" })).toEqual(["Thng"]);
    expect(linkBizOrder({ bsnsDivNm: "용역" })).toEqual(["Servc"]);
    // 원본이 없으면 둘 다 시도
    expect(linkBizOrder(null)).toEqual(["Thng", "Servc"]);
    expect(linkBizOrder({ bsnsDivNm: "공사" })).toEqual(["Thng", "Servc"]);
  });
});
