import { describe, expect, it } from "vitest";
import { findDuplicates, nameSimilarity, type ExistingDeal } from "./duplicates";

const ex = (o: Partial<ExistingDeal>): ExistingDeal => ({ id: "a", name: "차세대 서버 구축", customer: "한빛은행", owner: "김영업", status: "active", ...o });

describe("nameSimilarity", () => {
  it("띄어쓰기·기호 무시, 포함 관계는 1", () => {
    expect(nameSimilarity("차세대 서버 구축", "차세대서버구축")).toBe(1);
    expect(nameSimilarity("차세대 서버 구축 2단계", "차세대 서버 구축")).toBe(1);
    expect(nameSimilarity("차세대 서버 증설", "차세대 서버 구축")).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity("콜센터 AI 도입", "차세대 서버 구축")).toBeLessThan(0.3);
    expect(nameSimilarity("", "x")).toBe(0);
  });
});

describe("findDuplicates", () => {
  const list = [
    ex({ id: "1" }),
    ex({ id: "2", name: "차세대 서버 구축", customer: "(주)다른은행" }),
    ex({ id: "3", name: "콜센터 AI 도입" }),
    ex({ id: "4", name: "차세대 서버 증설", customer: "한빛 은행" }),
  ];
  it("같은 고객사(표기 차이 무시)에서 이름이 비슷한 사업만, 비슷한 순", () => {
    expect(findDuplicates("차세대서버 구축", "한빛은행", list).map((d) => d.id)).toEqual(["1", "4"]);
    expect(findDuplicates("콜센터 AI", "한빛은행", list).map((d) => d.id)).toEqual(["3"]);
    expect(findDuplicates("차세대 서버 구축", "없는은행", list)).toEqual([]);
    expect(findDuplicates("차", "한빛은행", list)).toEqual([]);
  });
});
