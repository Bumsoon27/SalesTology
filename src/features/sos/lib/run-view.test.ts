import { describe, expect, it } from "vitest";
import { parseRunId, runView, toRunningRun } from "./run-view";

describe("실행 기록 표시", () => {
  it("새·갱신 리드 수와 출처별 결과 (끝난 실행에서 못 간 업무는 '받지 않음')", () => {
    const v = runView(
      {
        analyze: { created: 3, updated: 5 },
        "g2b_plan:Thng": { fetched: 120, matched: 4 },
        "g2b_plan:Servc": { skipped: true },
        "g2b_prespec:Thng": { error: "08: 필수값 오류" },
      },
      "collect",
    );
    expect([v.created, v.updated]).toEqual([3, 5]);
    expect(v.sources.map((s) => [s.label, s.state, s.text])).toEqual([
      ["발주계획(물품)", "done", "완료 120건 · 일치 4"],
      ["발주계획(용역)", "done", "이미 받은 자료 재사용"],
      ["사전규격(물품)", "failed", "실패: 08: 필수값 오류"],
      ["사전규격(용역)", "waiting", "받지 않음"],
      ["입찰공고(물품)", "waiting", "받지 않음"],
      ["입찰공고(용역)", "waiting", "받지 않음"],
    ]);
  });

  it("재분석은 출처 줄이 없고, stats 가 비어도 0", () => {
    expect(runView(null, "reanalyze")).toEqual({ created: 0, updated: 0, sources: [] });
    expect(runView({ analyze: { created: "x" } }, "reanalyze").created).toBe(0);
  });

  it("실행 id 는 uuid 만", () => {
    expect(parseRunId("0B6F3C2E-1A2B-4C3D-8E9F-0A1B2C3D4E5F")).toBe("0b6f3c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f");
    expect(parseRunId("1; drop")).toBeNull();
    expect(parseRunId(undefined)).toBeNull();
    expect(parseRunId(["0b6f3c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"])).toBeNull();
  });
});

describe("toRunningRun", () => {
  it("저장된 커서로 진행 위치를, stats 는 그대로", () => {
    const steps = [{ kind: "purge" }, { kind: "link" }, { kind: "finish" }];
    expect(toRunningRun({ id: "r", mode: "collect", stats: { link: { tried: 1 } }, cursor: { steps, index: 1, totals: {} } })).toEqual({
      id: "r",
      mode: "collect",
      stats: { link: { tried: 1 } },
      progress: { index: 1, total: 3, label: "사업 흐름 연결" },
    });
    expect(toRunningRun({ id: "r", mode: "reanalyze", stats: null, cursor: null }).progress).toEqual({ index: 0, total: 0, label: "완료" });
  });
});
