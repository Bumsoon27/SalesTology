import { describe, expect, it } from "vitest";
import { competitorStats, toCompetitorRow, type Outcome } from "./competitors";

describe("toCompetitorRow", () => {
  it("이름·제안가·메모 검사", () => {
    expect(toCompetitorRow({ name: "  LG  CNS ", bid: "3억2000", isWinner: true, note: "" })).toEqual({
      ok: true,
      row: { name: "LG CNS", bid_amount: 320_000_000, is_winner: true, note: null },
    });
    expect(toCompetitorRow({ name: "삼성SDS", bid: "", isWinner: false, note: " 가격 공세 " })).toMatchObject({ ok: true, row: { bid_amount: null, note: "가격 공세" } });
    expect(toCompetitorRow({ name: "", bid: "", isWinner: false, note: "" }).ok).toBe(false);
    expect(toCompetitorRow({ name: "x".repeat(101), bid: "", isWinner: false, note: "" }).ok).toBe(false);
    expect(toCompetitorRow({ name: "a", bid: "많이", isWinner: false, note: "" }).ok).toBe(false);
    expect(toCompetitorRow({ name: "a", bid: "", isWinner: false, note: "x".repeat(301) }).ok).toBe(false);
  });
});

describe("competitorStats", () => {
  it("경쟁사별 우리 수주·그쪽 낙찰·다른 곳·진행 중 (표기 차이 합침)", () => {
    const outcomes = new Map<string, Outcome>([
      ["a", "won"],
      ["b", "lost"],
      ["c", "lost"],
      ["d", "open"],
    ]);
    const s = competitorStats(
      [
        { dealId: "a", name: "LG CNS", isWinner: false },
        { dealId: "b", name: "LGCNS", isWinner: true },
        { dealId: "c", name: "lg cns", isWinner: false },
        { dealId: "d", name: "LG CNS", isWinner: false },
        { dealId: "b", name: "삼성SDS", isWinner: false },
      ],
      outcomes,
    );
    expect(s).toEqual([
      { name: "LG CNS", deals: 4, weWon: 1, theyWon: 1, otherWon: 1, open: 1 },
      { name: "삼성SDS", deals: 1, weWon: 0, theyWon: 0, otherWon: 1, open: 0 },
    ]);
  });
});
