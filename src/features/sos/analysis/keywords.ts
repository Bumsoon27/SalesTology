import type { Keyword } from "../types";

// 비교용: 소문자 + 모든 공백 제거
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function matchKeywords(
  text: string,
  keywords: Keyword[],
): { matched: Keyword[]; excluded: boolean } {
  const hay = compactText(text);
  const hits = keywords.filter((k) => k.active && findTerm(hay, k.term, true).length > 0);
  return {
    matched: hits.filter((k) => k.tier !== "exclude"),
    excluded: hits.some((k) => k.tier === "exclude"),
  };
}

/** 리드 대상인지: 맞은 키워드가 하나 이상이고 제외 키워드에 걸리지 않음 */
export function isKeywordHit(text: string, keywords: Keyword[]): boolean {
  const m = matchKeywords(text, keywords);
  return m.matched.length > 0 && !m.excluded;
}

// 설정 화면 칩 입력: 쉼표·줄바꿈 분리, 대소문자 무시 중복은 먼저 쓴 표기 유지
export function parseKeywordInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const term = part.trim().replace(/\s+/g, " ");
    const key = term.toLowerCase();
    if (term === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

type Compact = { text: string; compact: string; map: number[] };

// 공백 제외 문자만 모으고 원문 인덱스를 기억한다 (글자 단위 소문자로 길이 유지)
function compactText(text: string): Compact {
  let compact = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) continue;
    const c = text[i].toLowerCase();
    for (let j = 0; j < c.length; j++) map.push(i);
    compact += c;
  }
  return { text, compact, map };
}

const ALNUM = /^[A-Za-z0-9]$/;
const isAlnum = (ch: string | undefined) => ch !== undefined && ALNUM.test(ch);

/**
 * 용어가 나오는 원문 범위 (end 미포함). 비교는 공백·대소문자 무시.
 * 용어의 첫·끝 글자가 영문·숫자면 원문에서 그 바깥 글자도 영문·숫자가 아니어야 한다 ("SMS"가 "ISMS-P"에 걸리지 않게).
 * 한글 쪽 끝은 부분 일치 그대로. 공백은 경계로 본다 (원문 기준이라 "IBM SMS"의 SMS 는 맞는다).
 */
function findTerm(hay: Compact, term: string, firstOnly = false): { start: number; end: number }[] {
  const t = squash(term);
  if (t === "") return [];
  const checkStart = isAlnum(t[0]);
  const checkEnd = isAlnum(t[t.length - 1]);
  const out: { start: number; end: number }[] = [];
  for (let at = hay.compact.indexOf(t); at !== -1; at = hay.compact.indexOf(t, at + 1)) {
    const start = hay.map[at];
    const end = hay.map[at + t.length - 1] + 1;
    if (checkStart && isAlnum(hay.text[start - 1])) continue;
    if (checkEnd && isAlnum(hay.text[end])) continue;
    out.push({ start, end });
    if (firstOnly) break;
  }
  return out;
}

// 카드 제목 하이라이트: 일치 규칙은 matchKeywords 와 같고, 결과 인덱스는 원문 기준(end 미포함)
export function highlightRanges(
  text: string,
  terms: string[],
): { start: number; end: number }[] {
  const hay = compactText(text);
  const raw = terms.flatMap((term) => findTerm(hay, term));

  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}
