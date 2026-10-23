import { describe, expect, it } from "vitest";
import { parseWon } from "./money";

describe("parseWon", () => {
  it.each([
    ["15000000", 15_000_000],
    ["15,000,000", 15_000_000],
    ["15,000,000원", 15_000_000],
    ["₩ 15,000,000", 15_000_000],
    [" 15000000 ", 15_000_000],
    ["1.5억", 150_000_000],
    ["1억 5000만", 150_000_000],
    ["1,500만원", 15_000_000],
    ["3억2000", 300_002_000],
  ])("%s → %d", (raw, value) => {
    expect(parseWon(raw)).toEqual({ ok: true, value });
  });

  it("빈 값은 null", () => {
    expect(parseWon("")).toEqual({ ok: true, value: null });
    expect(parseWon(null)).toEqual({ ok: true, value: null });
    expect(parseWon("  ")).toEqual({ ok: true, value: null });
  });

  it("음수는 허용할 때만 (GP 손실)", () => {
    expect(parseWon("-3,000,000", { allowNegative: true })).toEqual({ ok: true, value: -3_000_000 });
    expect(parseWon("-3000000")).toEqual({ ok: false });
  });

  it("알 수 없는 형식은 거부", () => {
    for (const raw of ["abc", "15%", "1.5", "억", "15백만", "1억억"]) expect(parseWon(raw)).toEqual({ ok: false });
  });
});
