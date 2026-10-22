// 법인 표기 — (주), ㈜, 주식회사. 이름 중간의 같은 글자는 상호의 일부일 수 있어 앞뒤만 제거한다
const LEADING = /^\s*(?:\(\s*주\s*\)|㈜|주식회사)\s*/;
const TRAILING = /\s*(?:\(\s*주\s*\)|㈜|주식회사)\s*$/;

function stripCorp(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed.replace(LEADING, "").replace(TRAILING, "").trim();
  // 표기만 있는 이름은 비우지 않고 원문 유지
  return stripped === "" ? trimmed : stripped;
}

// 중복 비교용 키: 법인 표기·공백 제거 + 소문자
export function normalizeOrgName(name: string): string {
  return stripCorp(name).replace(/\s+/g, "").toLowerCase();
}

// A 로 넘길 표시 이름: 앞뒤 법인 표기만 지우고 공백은 하나로
export function displayOrgName(name: string): string {
  return stripCorp(name).replace(/\s+/g, " ").trim();
}
