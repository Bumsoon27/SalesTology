import { describe, expect, it } from "vitest";
import { needsAiSummary, shouldWriteTemplate } from "./keep";

describe("shouldWriteTemplate", () => {
  it("AI 요약은 사실이 바뀐 실행에서만 템플릿으로 덮는다", () => {
    expect(shouldWriteTemplate({ summary: "AI 문장", summary_source: "ai" }, "템플릿", false)).toBe(false);
    expect(shouldWriteTemplate({ summary: "AI 문장", summary_source: "ai" }, "템플릿", true)).toBe(true);
  });
  it("문장이나 출처가 바뀔 때만 쓴다", () => {
    expect(shouldWriteTemplate({ summary: "템플릿", summary_source: "template" }, "템플릿", false)).toBe(false);
    expect(shouldWriteTemplate({ summary: "템플릿", summary_source: "template" }, "템플릿", true)).toBe(false);
    expect(shouldWriteTemplate({ summary: "예전", summary_source: "template" }, "템플릿", false)).toBe(true);
    expect(shouldWriteTemplate({ summary: null, summary_source: null }, "템플릿", false)).toBe(true);
  });
});

describe("needsAiSummary", () => {
  it("이미 AI 요약이 있고 사실이 그대로면 다시 부르지 않는다", () => {
    expect(needsAiSummary({ summary_source: "ai" }, false)).toBe(false);
    expect(needsAiSummary({ summary_source: "ai" }, true)).toBe(true);
    expect(needsAiSummary({ summary_source: "template" }, false)).toBe(true);
    expect(needsAiSummary({ summary_source: null }, false)).toBe(true);
  });
});
