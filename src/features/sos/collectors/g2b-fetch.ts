import "server-only";
import { buildQuery, endpointFor, G2B_BASE, parseG2bResponse, type G2bOp, type G2bParsed } from "./g2b";

const TIMEOUT_MS = 20_000;

/** 한 페이지 조회. 네트워크 오류는 던지지 않고 결과로 돌려준다 (URL 에 키가 있어 메시지에 URL 을 넣지 않음) */
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
  try {
    const res = await fetch(`${G2B_BASE}${endpointFor(op)}?${qs}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, code: "HTTP", message: `나라장터 응답 오류 (${res.status})` };
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, code: "PARSE", message: "나라장터 응답을 읽을 수 없습니다" };
    }
    return parseG2bResponse(json);
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, code: "NETWORK", message: timeout ? "나라장터 응답 시간 초과" : "나라장터 연결 실패" };
  }
}
