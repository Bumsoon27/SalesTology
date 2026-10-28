import "server-only";
import { buildQuery, endpointFor, G2B_BASE, parseG2bResponse, type G2bOp, type G2bParsed } from "./g2b";
import { withRetry } from "./retry";

// 한 번 시도의 시간 제한과, 재시도를 합친 한 쪽의 시간 예산 (한 단계 60초 안에 원본 저장까지)
const TIMEOUT_MS = 20_000;
const RETRY = { tries: 3, waitMs: 1_500, budgetMs: 40_000, attemptMs: TIMEOUT_MS, minAttemptMs: 8_000 };

// transient: 시간 초과·연결 실패·5xx — 잠깐 뒤 다시 물으면 될 수 있는 오류
type Attempt = { parsed: G2bParsed; transient: boolean };

/**
 * 한 페이지 조회. 일시적 오류는 짧게 쉬었다 다시 묻고(최대 2회), 그래도 실패하면 결과로 돌려준다.
 * 네트워크 오류는 던지지 않는다 (URL 에 키가 있어 메시지에 URL 을 넣지 않음)
 */
export async function fetchG2bPage(
  op: G2bOp,
  range: { from: Date; to: Date },
  page: number,
  rows = 999,
): Promise<G2bParsed> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return { ok: false, code: "NO_KEY", message: "나라장터 서비스키가 설정되지 않았습니다" };
  const qs = new URLSearchParams(buildQuery(op, range, page, rows));
  qs.set("serviceKey", key);
  const url = `${G2B_BASE}${endpointFor(op)}?${qs}`;
  const r = await withRetry((timeoutMs) => fetchOnce(url, timeoutMs), (a) => a.transient, RETRY);
  return r.parsed;
}

async function fetchOnce(url: string, timeoutMs: number): Promise<Attempt> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) {
      return { parsed: { ok: false, code: "HTTP", message: `나라장터 응답 오류 (${res.status})` }, transient: res.status >= 500 || res.status === 429 };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { parsed: { ok: false, code: "PARSE", message: "나라장터 응답을 읽을 수 없습니다" }, transient: false };
    }
    return { parsed: parseG2bResponse(json), transient: false };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { parsed: { ok: false, code: "NETWORK", message: timeout ? "나라장터 응답 시간 초과" : "나라장터 연결 실패" }, transient: true };
  }
}
