/** AI 요약 검증: 1~2문장, 200자 이하, 숫자 없음(환각 방지). 서버 전용 모듈 밖에서도 테스트할 수 있게 분리. */
export function isAcceptableAiSummary(text: string, allowed: string[] = []): boolean {
  const t = text.trim();
  if (t.length < 1 || t.length > 200) return false;
  // 사실에 있던 문자열(제품 모델명 등) 안의 숫자만 허용한다
  let rest = t;
  for (const a of allowed) if (a) rest = rest.split(a).join("");
  if (/[0-9]/.test(rest)) return false;
  const sentences = t.split(/[.!?]\s*/).filter((s) => s.trim().length > 0);
  return sentences.length >= 1 && sentences.length <= 2;
}
