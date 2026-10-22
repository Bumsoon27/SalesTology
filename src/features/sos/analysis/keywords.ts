import type { Keyword } from "../types";

// 비교용: 소문자 + 모든 공백 제거
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function matchKeywords(
  text: string,
  keywords: Keyword[],
): { matched: Keyword[]; excluded: boolean } {
  const hay = squash(text);
  const hits = keywords.filter((k) => {
    if (!k.active) return false;
    const t = squash(k.term);
    return t !== "" && hay.includes(t);
  });
  return {
    matched: hits.filter((k) => k.tier !== "exclude"),
    excluded: hits.some((k) => k.tier === "exclude"),
  };
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

// 카드 제목 하이라이트: 비교는 공백·대소문자 무시, 결과 인덱스는 원문 기준(end 미포함)
export function highlightRanges(
  text: string,
  terms: string[],
): { start: number; end: number }[] {
  // 공백 제외 문자만 모으고 원문 인덱스를 기억한다 (글자 단위 소문자로 길이 유지)
  let compact = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) continue;
    const c = text[i].toLowerCase();
    for (let j = 0; j < c.length; j++) map.push(i);
    compact += c;
  }

  const raw: { start: number; end: number }[] = [];
  for (const term of terms) {
    const t = squash(term);
    if (t === "") continue;
    for (let at = compact.indexOf(t); at !== -1; at = compact.indexOf(t, at + 1)) {
      raw.push({ start: map[at], end: map[at + t.length - 1] + 1 });
    }
  }

  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}
