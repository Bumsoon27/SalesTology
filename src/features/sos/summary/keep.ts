// 요약을 다시 쓸지 정하는 규칙 (순수). 불필요한 쓰기는 updated_at 을 올려 화면의 충돌 검사를 헛돌게 한다.
type Stored = { summary: string | null; summary_source: string | null };

/** 템플릿 요약을 저장할지. AI 요약은 이번 실행에서 사실이 바뀐 리드만 덮는다 */
export function shouldWriteTemplate(prev: Stored, text: string, factsChanged: boolean): boolean {
  if (prev.summary_source === "ai" && !factsChanged) return false;
  return prev.summary !== text || prev.summary_source !== "template";
}

/** AI 요약을 새로 받을지. 이미 있고 사실이 그대로면 호출을 아낀다 */
export function needsAiSummary(prev: Pick<Stored, "summary_source">, factsChanged: boolean): boolean {
  return prev.summary_source !== "ai" || factsChanged;
}
