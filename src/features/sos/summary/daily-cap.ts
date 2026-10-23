// Gemini 하루 호출 상한 (순수). 무료 등급 한도 안에서 부문끼리 나눠 쓰도록 부문당 KST 하루 30회.
export const AI_DAILY_CAP = 30;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** 실행 stats 하나의 Gemini 호출 수. aiCalls 가 없던 실행은 성공+실패로 센다 */
export function aiCallsOf(stats: unknown): number {
  if (!stats || typeof stats !== "object") return 0;
  const s = (stats as { summary?: unknown }).summary;
  if (!s || typeof s !== "object") return 0;
  const { aiCalls, ai, aiFallback } = s as Record<string, unknown>;
  return aiCalls !== undefined ? num(aiCalls) : num(ai) + num(aiFallback);
}

/** 오늘(KST) 실행들의 stats → 남은 호출 수 */
export function aiCallsLeft(todayStats: unknown[], cap = AI_DAILY_CAP): number {
  const used = todayStats.reduce<number>((sum, s) => sum + aiCallsOf(s), 0);
  return Math.max(0, cap - used);
}
