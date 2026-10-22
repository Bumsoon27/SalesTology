import { describe, expect, it } from "vitest";
import { selectRunsToPurge } from "./retention";

const now = new Date("2026-10-22T00:00:00Z");
const r = (id: string, daysAgo: number) => ({ id, startedAt: new Date(now.getTime() - daysAgo * 864e5).toISOString() });

describe("selectRunsToPurge", () => {
  it("14일 안 2회면 최근 3회까지 보관", () => {
    expect(selectRunsToPurge([r("a", 1), r("b", 13), r("c", 15), r("d", 30)], now)).toEqual(["d"]);
  });
  it("14일 밖 하나", () => {
    expect(selectRunsToPurge([r("a", 1), r("b", 2), r("c", 3), r("d", 15)], now)).toEqual(["d"]);
  });
  it("모두 오래돼도 최근 3회", () => {
    expect(selectRunsToPurge([r("a", 20), r("b", 25), r("c", 30), r("d", 40)], now)).toEqual(["d"]);
  });
  it("순서 무관·빈 목록", () => {
    expect(selectRunsToPurge([r("d", 30), r("a", 20), r("c", 25), r("b", 21)], now)).toEqual(["d"]);
    expect(selectRunsToPurge([], now)).toEqual([]);
  });
});
