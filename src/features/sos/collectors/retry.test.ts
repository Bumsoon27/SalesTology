import { describe, expect, it } from "vitest";
import { withRetry, type RetryOptions } from "./retry";

// 가짜 시계: 시도마다 걸린 시간·대기를 더한다
function harness(results: { ok: boolean; took: number }[]) {
  let t = 0;
  const timeouts: number[] = [];
  const opts: RetryOptions = {
    tries: 3,
    waitMs: 1000,
    budgetMs: 40_000,
    attemptMs: 20_000,
    minAttemptMs: 5_000,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
  let i = 0;
  const attempt = async (timeoutMs: number) => {
    timeouts.push(timeoutMs);
    const r = results[i++];
    t += Math.min(r.took, timeoutMs);
    return r;
  };
  return { opts, attempt, timeouts, calls: () => i };
}

const retryable = (r: { ok: boolean }) => !r.ok;

describe("withRetry", () => {
  it("성공하면 바로 돌려준다", async () => {
    const h = harness([{ ok: true, took: 500 }]);
    expect(await withRetry(h.attempt, retryable, h.opts)).toEqual({ ok: true, took: 500 });
    expect(h.calls()).toBe(1);
  });

  it("짧은 실패 뒤 성공하면 다시 물어 성공을 돌려준다", async () => {
    const h = harness([{ ok: false, took: 300 }, { ok: true, took: 300 }]);
    expect((await withRetry(h.attempt, retryable, h.opts)).ok).toBe(true);
    expect(h.timeouts).toEqual([20_000, 20_000]);
  });

  it("시도 수를 넘기지 않고 마지막 실패를 돌려준다", async () => {
    const h = harness([{ ok: false, took: 100 }, { ok: false, took: 100 }, { ok: false, took: 100 }, { ok: true, took: 100 }]);
    expect((await withRetry(h.attempt, retryable, h.opts)).ok).toBe(false);
    expect(h.calls()).toBe(3);
  });

  it("시간 초과가 이어지면 남은 예산만큼만 기다리고, 예산이 모자라면 그만둔다", async () => {
    const h = harness([{ ok: false, took: 99_000 }, { ok: false, took: 99_000 }, { ok: true, took: 0 }]);
    expect((await withRetry(h.attempt, retryable, h.opts)).ok).toBe(false);
    // 20초 → 대기 1초 → 남은 19초 → 그 뒤 남은 0초라 세 번째는 하지 않는다
    expect(h.timeouts).toEqual([20_000, 19_000]);
  });

  it("다시 물을 수 없는 결과는 재시도하지 않는다", async () => {
    const h = harness([{ ok: false, took: 100 }, { ok: true, took: 100 }]);
    expect((await withRetry(h.attempt, () => false, h.opts)).ok).toBe(false);
    expect(h.calls()).toBe(1);
  });
});
