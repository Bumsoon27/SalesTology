import { describe, expect, it } from "vitest";
import { MEMO_MAX, normalizeKeywordTerm, parseLeadPatch, parseTier, TERM_MAX } from "./lead-input";

const ID = "0b6f3c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

describe("리드 수정 입력 검증", () => {
  it("허용된 칸만 DB 칸 이름으로 바꾼다", () => {
    expect(parseLeadPatch({ status: "on_hold" })).toEqual({ ok: true, patch: { status: "on_hold" } });
    expect(parseLeadPatch({ assigneeId: ID, memo: "  메모  " })).toEqual({ ok: true, patch: { assignee_id: ID, memo: "메모" } });
    expect(parseLeadPatch({ assigneeId: null, memo: "   " })).toEqual({ ok: true, patch: { assignee_id: null, memo: null } });
  });

  it("전환 상태·모르는 값·빈 요청은 거절", () => {
    expect(parseLeadPatch({ status: "converted" }).ok).toBe(false);
    expect(parseLeadPatch({ status: "weird" }).ok).toBe(false);
    expect(parseLeadPatch({ assigneeId: "x" }).ok).toBe(false);
    expect(parseLeadPatch({ memo: 3 }).ok).toBe(false);
    expect(parseLeadPatch({ memo: "가".repeat(MEMO_MAX + 1) }).ok).toBe(false);
    expect(parseLeadPatch({}).ok).toBe(false);
    expect(parseLeadPatch(null).ok).toBe(false);
    expect(parseLeadPatch("status").ok).toBe(false);
  });

  it("다른 칸을 섞어 보내도 무시한다 (team_id·score 등)", () => {
    expect(parseLeadPatch({ status: "reviewing", team_id: "t", score: 100 })).toEqual({ ok: true, patch: { status: "reviewing" } });
  });
});

describe("제목에서 키워드 추가 검증", () => {
  it("앞뒤 공백 제거·가운데 공백은 하나로", () => {
    expect(normalizeKeywordTerm("  테이프\n 라이브러리 ")).toEqual({ ok: true, term: "테이프 라이브러리" });
  });

  it("빈 값·공백만·50자 초과·문자열 아님은 거절", () => {
    expect(normalizeKeywordTerm("").ok).toBe(false);
    expect(normalizeKeywordTerm(" \n\t ").ok).toBe(false);
    expect(normalizeKeywordTerm("가".repeat(TERM_MAX)).ok).toBe(true);
    expect(normalizeKeywordTerm("가".repeat(TERM_MAX + 1)).ok).toBe(false);
    expect(normalizeKeywordTerm(7).ok).toBe(false);
  });

  it("parseTier: 세 칸만", () => {
    expect(parseTier("core")).toBe("core");
    expect(parseTier("exclude")).toBe("exclude");
    expect(parseTier("admin")).toBeNull();
  });
});
