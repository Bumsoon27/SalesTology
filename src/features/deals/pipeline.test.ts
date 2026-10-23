import { describe, expect, it } from "vitest";
import { summarizeByOwner, summarizePipeline } from "./pipeline";

describe("summarizeByOwner", () => {
  it("영업대표별 건수·규모·가중 예상, 가중 큰 순, 나 표시, 진행 중만", () => {
    const base = { name: "x", last_activity_at: "2026-10-22T00:00:00Z", customer: { id: "c", name: "A" }, gp: null };
    const r = summarizeByOwner(
      [
        { ...base, id: "1", stage: "proposal", status: "active", amount: 100, owner_id: "me", owner: "나" }, // 40
        { ...base, id: "2", stage: "won", status: "active", amount: 100, owner_id: "dj", owner: "DJ" }, // 100
        { ...base, id: "3", stage: "discovery", status: "active", amount: null, owner_id: "me", owner: "나" },
        { ...base, id: "4", stage: "won", status: "lost", amount: 999, owner_id: "dj", owner: "DJ" },
      ],
      "me",
    );
    expect(r.map((x) => [x.owner, x.count, x.total, x.weighted, x.isMe])).toEqual([
      ["DJ", 1, 100, 100, false],
      ["나", 2, 100, 40, true],
    ]);
  });
});

const deal = (o: Partial<Parameters<typeof summarizePipeline>[0][number]>) => ({
  id: "d",
  name: "사업",
  stage: "discovery" as const,
  status: "active" as const,
  amount: null,
  gp: null,
  last_activity_at: "2026-10-22T09:00:00Z",
  customer: { id: "c", name: "한빛은행" },
  ...o,
});

describe("summarizePipeline", () => {
  const today = "2026-10-23";

  it("규모·가중 예상·확정·GP율", () => {
    const s = summarizePipeline(
      [
        deal({ id: "a", stage: "proposal", amount: 100_000_000, gp: 10_000_000 }), // 40%
        deal({ id: "b", stage: "won", amount: 50_000_000, gp: 5_000_000 }), // 100%
        deal({ id: "c", stage: "discovery", amount: 200_000_000 }), // 10%, GP 없음
        deal({ id: "d", stage: "quoting" }), // 규모 없음
        deal({ id: "e", stage: "negotiation", amount: 999, status: "lost" }), // 제외
      ],
      today,
    );
    expect(s).toMatchObject({
      activeCount: 4,
      total: 350_000_000,
      weighted: 40_000_000 + 50_000_000 + 20_000_000,
      committed: 50_000_000,
      gp: 15_000_000,
      gpRate: 10,
      missingAmount: 1,
    });
    expect(s.stages.map((x) => [x.stage, x.count, x.amount])).toEqual([
      ["discovery", 1, 200_000_000],
      ["quoting", 1, 0],
      ["proposal", 1, 100_000_000],
      ["won", 1, 50_000_000],
    ]);
  });

  it("수주 전 단계에서 14일 넘게 손대지 않은 사업만 정체, 오래된 순", () => {
    const s = summarizePipeline(
      [
        deal({ id: "a", last_activity_at: "2026-10-09T00:00:00Z" }), // 14일
        deal({ id: "b", last_activity_at: "2026-09-01T00:00:00Z" }), // 52일
        deal({ id: "c", last_activity_at: "2026-10-10T00:00:00Z" }), // 13일
        deal({ id: "d", stage: "fulfillment", last_activity_at: "2026-01-01T00:00:00Z" }), // 수주 후 → 제외
      ],
      today,
    );
    expect(s.stale.map((x) => [x.id, x.idleDays])).toEqual([
      ["b", 52],
      ["a", 14],
    ]);
  });

  it("GP 를 넣은 사업이 없으면 GP율 없음", () => {
    expect(summarizePipeline([deal({ amount: 1000 })], today).gpRate).toBeNull();
    expect(summarizePipeline([], today)).toMatchObject({ activeCount: 0, total: 0, weighted: 0, stages: [], stale: [] });
  });
});
