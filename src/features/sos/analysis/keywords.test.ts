import { describe, expect, it } from "vitest";
import type { Tier } from "../types";
import { highlightRanges, matchKeywords, parseKeywordInput } from "./keywords";

const K = (term: string, tier: Tier, active = true) => ({ id: term, term, tier, weight: null, active });
const kw = [
  K("LTO드라이브", "core"),
  K("onTune", "core"),
  K("서버", "core"),
  K("서버실 공사", "exclude"),
  K("AIX", "extended", false),
];

describe("matchKeywords", () => {
  it("대소문자·공백을 무시하고 부분 일치한다", () => {
    expect(matchKeywords("백업용 LTO 드라이브 구매", kw).matched.map((k) => k.term)).toEqual(["LTO드라이브"]);
    expect(matchKeywords("ONTUNE 유지보수", kw).matched.map((k) => k.term)).toEqual(["onTune"]);
  });

  it("제외 키워드는 matched 에서 빠지고 excluded 가 된다", () => {
    expect(matchKeywords("본관 서버실 공사", kw)).toEqual({
      matched: [expect.objectContaining({ term: "서버" })],
      excluded: true,
    });
  });

  it("비활성 키워드는 무시한다", () => {
    expect(matchKeywords("AIX 서버", kw).matched.map((k) => k.term)).toEqual(["서버"]);
  });
});

describe("parseKeywordInput", () => {
  it("쉼표·줄바꿈 분리, 공백 정리, 빈 값·중복 제거", () => {
    expect(parseKeywordInput(" IBM, 스토리지\n,IBM ,, ")).toEqual(["IBM", "스토리지"]);
    expect(parseKeywordInput("ibm, IBM")).toEqual(["ibm"]);
  });
});

describe("highlightRanges", () => {
  it("원문 인덱스로 돌려주고 겹치면 병합한다", () => {
    expect(highlightRanges("IBM 서버 및 IBM 스토리지", ["IBM", "IBM 스"])).toEqual([
      { start: 0, end: 3 },
      { start: 9, end: 14 },
    ]);
  });

  it("빈 용어는 무시한다", () => {
    expect(highlightRanges("abc", ["", " "])).toEqual([]);
  });
});
