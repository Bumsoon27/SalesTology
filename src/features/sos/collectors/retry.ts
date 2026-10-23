// 나라장터 한 쪽 조회 재시도 — 순수 (시계·대기는 주입). 한 단계가 60초 안에 끝나도록 전체 시간 예산 안에서만 다시 묻는다.

export type RetryOptions = {
  // 처음 포함 최대 시도 수
  tries: number;
  // 다시 묻기 전 대기
  waitMs: number;
  // 모든 시도·대기를 합친 시간 예산
  budgetMs: number;
  // 한 번 시도의 시간 제한 상한 (남은 예산이 더 적으면 남은 만큼)
  attemptMs: number;
  // 남은 예산이 이보다 적으면 다시 묻지 않는다 (그 시간으론 응답을 못 받는다)
  minAttemptMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** attempt(시간 제한) 결과가 retryable 이면 예산 안에서 다시 시도하고, 마지막 결과를 돌려준다 */
export async function withRetry<T>(
  attempt: (timeoutMs: number) => Promise<T>,
  retryable: (r: T) => boolean,
  o: RetryOptions,
): Promise<T> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? realSleep;
  const deadline = now() + o.budgetMs;
  let result = await attempt(Math.min(o.attemptMs, o.budgetMs));
  for (let i = 1; i < o.tries && retryable(result); i++) {
    if (deadline - now() - o.waitMs < o.minAttemptMs) break;
    await sleep(o.waitMs);
    result = await attempt(Math.min(o.attemptMs, deadline - now()));
  }
  return result;
}
