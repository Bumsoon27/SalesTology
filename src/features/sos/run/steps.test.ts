import { describe, expect, it } from "vitest";
import { G2B_OPS } from "../collectors/g2b";
import {
  advance,
  afterFetch,
  continueWith,
  finalStatus,
  isBusy,
  isStale,
  opLabel,
  parseCursor,
  planRun,
  runRange,
  stepLabel,
  withLease,
  type RunCursor,
} from "./steps";

describe("planRun", () => {
  it("collect / reanalyze 단계 순서", () => {
    expect(planRun("collect").map((s) => s.kind)).toEqual(["purge", "fetch", "fetch", "fetch", "fetch", "fetch", "fetch", "link", "analyze", "summarize", "finish"]);
    expect(planRun("reanalyze").map((s) => s.kind)).toEqual(["analyze", "summarize", "finish"]);
  });

  it("collect 의 fetch 는 6개 업무 모두 1쪽부터", () => {
    const fetches = planRun("collect").filter((s) => s.kind === "fetch");
    expect(fetches).toEqual(G2B_OPS.map((op) => ({ kind: "fetch", op, page: 1 })));
  });
});

describe("afterFetch", () => {
  const c0: RunCursor = { steps: planRun("collect"), index: 1, totals: {} };

  it("다음 쪽이 있으면 바로 뒤에 삽입", () => {
    const c1 = afterFetch(c0, G2B_OPS[0], 1, 2500, 999);
    expect(c1.steps[2]).toEqual({ kind: "fetch", op: G2B_OPS[0], page: 2 });
    expect(c1.steps).toHaveLength(c0.steps.length + 1);
    expect(c1.index).toBe(1); // 진행은 advance 가 한다
    expect(c1.totals[opLabel(G2B_OPS[0])]).toBe(2500);
  });

  it("마지막 쪽이면 삽입하지 않음", () => {
    expect(afterFetch(c0, G2B_OPS[0], 3, 2500, 999).steps).toHaveLength(c0.steps.length);
    expect(afterFetch(c0, G2B_OPS[0], 1, 0, 999).steps).toHaveLength(c0.steps.length);
    expect(afterFetch(c0, G2B_OPS[0], 1, 999, 999).steps).toHaveLength(c0.steps.length);
  });

  it("원래 커서는 바꾸지 않음", () => {
    afterFetch(c0, G2B_OPS[0], 1, 2500, 999);
    expect(c0.steps).toHaveLength(11);
  });
});

describe("continueWith / advance", () => {
  it("같은 종류 단계를 이어서 다시 넣는다 (나눠 처리)", () => {
    const c = { steps: planRun("reanalyze"), index: 0, totals: {} };
    const c1 = continueWith(c, { kind: "analyze", after: "id-9" });
    expect(c1.steps.map((s) => s.kind)).toEqual(["analyze", "analyze", "summarize", "finish"]);
    expect(c1.steps[1]).toEqual({ kind: "analyze", after: "id-9" });
    expect(advance(c1).index).toBe(1);
  });
});

describe("isStale", () => {
  it("15분 초과면 멈춘 실행", () => {
    expect(isStale(new Date("2026-10-22T00:00:00Z").toISOString(), new Date("2026-10-22T00:15:01Z"))).toBe(true);
    expect(isStale(new Date("2026-10-22T00:00:00Z").toISOString(), new Date("2026-10-22T00:14:59Z"))).toBe(false);
    // DB 표기(+00:00)도 같은 시각으로 읽는다
    expect(isStale("2026-10-22T00:00:00.123456+00:00", new Date("2026-10-22T00:15:01Z"))).toBe(true);
  });
});

describe("isBusy / withLease", () => {
  const now = new Date("2026-10-22T00:00:00Z");
  it("다른 요청이 단계를 처리 중이면 busy", () => {
    const c = withLease({ steps: planRun("reanalyze"), index: 0, totals: {} }, now);
    expect(isBusy(c, new Date("2026-10-22T00:00:30Z"))).toBe(true);
    expect(isBusy(c, new Date("2026-10-22T00:02:00Z"))).toBe(false);
    expect(isBusy({ ...c, lease: null }, now)).toBe(false);
  });
});

describe("runRange", () => {
  const now = new Date("2026-10-22T03:00:00Z");
  it("첫 실행은 최근 firstRunDays 일", () => {
    expect(runRange(null, now, 30).from.toISOString()).toBe("2026-09-22T03:00:00.000Z");
    expect(runRange(null, now, 30).to.toISOString()).toBe(now.toISOString());
  });
  it("지난 실행 이후부터", () => {
    expect(runRange("2026-10-21T01:00:00Z", now, 30).from.toISOString()).toBe("2026-10-21T01:00:00.000Z");
  });
  it("오래전 실행이어도 firstRunDays 보다 멀리 가지 않음", () => {
    expect(runRange("2026-07-01T00:00:00Z", now, 30).from.toISOString()).toBe("2026-09-22T03:00:00.000Z");
  });
});

describe("finalStatus", () => {
  it("한 출처라도 오류가 있으면 partial", () => {
    expect(finalStatus({ "g2b_bid:Thng": { fetched: 10 } })).toBe("done");
    expect(finalStatus({ "g2b_bid:Thng": { fetched: 10 }, "g2b_plan:Servc": { error: "08: 필수값" } })).toBe("partial");
    expect(finalStatus({})).toBe("done");
  });
});

describe("stepLabel", () => {
  it("화면 표시용 이름", () => {
    expect(stepLabel({ kind: "fetch", op: { source: "g2b_prespec", biz: "Servc" }, page: 2 })).toBe("사전규격(용역) 2쪽 수집");
    expect(stepLabel({ kind: "purge" })).toBe("보관 정리");
    expect(stepLabel(null)).toBe("완료");
  });
});

describe("parseCursor", () => {
  it("DB jsonb 커서 검사", () => {
    const c = { steps: planRun("reanalyze"), index: 1, totals: {} };
    expect(parseCursor(c)).toEqual(c);
    expect(parseCursor({})).toBeNull();
    expect(parseCursor(null)).toBeNull();
    expect(parseCursor({ steps: [], index: -1, totals: {} })).toBeNull();
    expect(parseCursor({ steps: planRun("reanalyze"), index: "1" })).toBeNull();
  });
});
