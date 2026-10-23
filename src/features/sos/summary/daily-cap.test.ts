import { describe, expect, it } from "vitest";
import { AI_DAILY_CAP, aiCallsLeft, aiCallsOf } from "./daily-cap";

describe("aiCallsOf", () => {
  it("실행 stats 에서 Gemini 호출 수 (aiCalls, 없으면 성공+실패)", () => {
    expect(aiCallsOf({ summary: { aiCalls: 4, ai: 1, aiFallback: 1 } })).toBe(4);
    expect(aiCallsOf({ summary: { ai: 3, aiFallback: 2 } })).toBe(5);
    expect(aiCallsOf({ summary: { template: 9 } })).toBe(0);
    expect(aiCallsOf({})).toBe(0);
    expect(aiCallsOf(null)).toBe(0);
    expect(aiCallsOf({ summary: { aiCalls: "x" } })).toBe(0);
  });
});

describe("aiCallsLeft", () => {
  it("부문당 KST 하루 30회", () => {
    expect(AI_DAILY_CAP).toBe(30);
    expect(aiCallsLeft([])).toBe(30);
    expect(aiCallsLeft([{ summary: { aiCalls: 5 } }, { summary: { ai: 4, aiFallback: 1 } }])).toBe(20);
    expect(aiCallsLeft([{ summary: { aiCalls: 30 } }])).toBe(0);
    expect(aiCallsLeft([{ summary: { aiCalls: 40 } }])).toBe(0);
  });
});
