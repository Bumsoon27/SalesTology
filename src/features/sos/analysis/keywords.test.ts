import { describe, expect, it } from "vitest";
import type { Tier } from "../types";
import { highlightRanges, isKeywordHit, matchKeywords, parseKeywordInput } from "./keywords";

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

  it("영문·숫자 키워드는 앞뒤가 영문·숫자가 아닐 때만 일치한다", () => {
    const k = [K("SMS", "core"), K("5G", "core"), K("LTO드라이브", "core")];
    const terms = (t: string) => matchKeywords(t, k).matched.map((x) => x.term);
    expect(terms("ISMS-P 인증 컨설팅")).toEqual([]);
    expect(terms("SMSC 장비")).toEqual([]);
    expect(terms("문자(SMS) 발송 서비스")).toEqual(["SMS"]);
    expect(terms("SMS발송 서비스")).toEqual(["SMS"]);
    expect(terms("대량 sms")).toEqual(["SMS"]);
    expect(terms("15G 회선")).toEqual([]);
    expect(terms("5G 기지국")).toEqual(["5G"]);
    // 공백을 지운 뒤 붙는 글자는 경계로 본다 — 원문 기준
    expect(terms("IBM SMS 연동")).toEqual(["SMS"]);
    // 한글 쪽 끝은 부분 일치 그대로
    expect(terms("XLTO드라이브")).toEqual([]);
    expect(terms("백업 LTO 드라이브류")).toEqual(["LTO드라이브"]);
  });

  it("한글 키워드는 부분 일치를 유지한다", () => {
    expect(matchKeywords("전산서버실", kw).matched.map((k) => k.term)).toEqual(["서버"]);
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

  it("영문 키워드는 단어 경계에서만 칠한다", () => {
    expect(highlightRanges("ISMS-P 및 SMS 연동", ["SMS"])).toEqual([{ start: 9, end: 12 }]);
  });

  it("빈 용어는 무시한다", () => {
    expect(highlightRanges("abc", ["", " "])).toEqual([]);
  });
});

describe("isKeywordHit", () => {
  const kws = [
    { id: "a", term: "서버", tier: "core" as const, weight: null, active: true },
    { id: "x", term: "청소", tier: "exclude" as const, weight: null, active: true },
  ];
  it("맞은 키워드가 있고 제외 키워드가 없을 때만 true", () => {
    expect(isKeywordHit("서버 교체", kws)).toBe(true);
    expect(isKeywordHit("서버실 청소", kws)).toBe(false);
    expect(isKeywordHit("청소 용역", kws)).toBe(false);
    expect(isKeywordHit("도서 구입", kws)).toBe(false);
  });
});
