// 법인 표기 — (주), ㈜, 주식회사 (공백 유무 무관)
const CORP_MARK = /\(\s*주\s*\)|㈜|주식회사/g;

// 중복 비교용 키: 법인 표기·공백 제거 + 소문자
export function normalizeOrgName(name: string): string {
  return name.replace(CORP_MARK, "").replace(/\s+/g, "").toLowerCase();
}

// A 로 넘길 표시 이름: 법인 표기만 지우고 공백은 하나로
export function displayOrgName(name: string): string {
  return name.replace(CORP_MARK, "").replace(/\s+/g, " ").trim();
}
