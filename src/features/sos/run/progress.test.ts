import { describe, expect, it } from "vitest";
import { progressRatio, sourceLines } from "./progress";

describe("수집 진행 표시", () => {
  it("출처(업무)별 상태 글자 — 대기·진행·완료·재사용·실패", () => {
    const lines = sourceLines(
      {
        "g2b_plan:Thng": { fetched: 120, matched: 4, pages: 1 },
        "g2b_plan:Servc": { skipped: true, fetched: 0, matched: 0 },
        "g2b_prespec:Thng": { fetched: 999, matched: 10, pages: 1 },
        "g2b_prespec:Servc": { error: "08: 필수값 오류" },
      },
      "사전규격(물품) 2쪽 수집",
    );
    expect(lines.map((l) => [l.label, l.state, l.text])).toEqual([
      ["발주계획(물품)", "done", "완료 120건 · 일치 4"],
      ["발주계획(용역)", "done", "이미 받은 자료 재사용"],
      ["사전규격(물품)", "active", "진행 999건 · 일치 10"],
      ["사전규격(용역)", "failed", "실패: 08: 필수값 오류"],
      ["입찰공고(물품)", "waiting", "대기"],
      ["입찰공고(용역)", "waiting", "대기"],
    ]);
  });

  it("아직 기록이 없는 업무도 지금 단계면 진행", () => {
    const [plan] = sourceLines({}, "발주계획(물품) 1쪽 수집");
    expect([plan.state, plan.text]).toEqual(["active", "진행"]);
  });

  it("진행 비율은 0~1, 단계 수가 없으면 0", () => {
    expect(progressRatio({ index: 3, total: 12 })).toBe(0.25);
    expect(progressRatio({ index: 0, total: 0 })).toBe(0);
    expect(progressRatio({ index: 15, total: 12 })).toBe(1);
  });
});
