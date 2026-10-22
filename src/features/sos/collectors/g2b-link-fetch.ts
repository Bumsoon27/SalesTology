import "server-only";
import { sosEnv } from "../server/env";
import { G2B_BASE, parseG2bResponse, type G2bOp } from "./g2b";
import { buildLinkQuery, linkEndpoint, pickPlanNo } from "./g2b-link";

const TIMEOUT_MS = 8_000;

export type LinkResult = { ok: true; planNo: string | null } | { ok: false; code: string };

/** 사전규격 번호 → 발주계획 번호. 던지지 않는다. URL 에 키가 있어 메시지에 URL·키를 넣지 않는다 */
export async function fetchPlanNoForPrespec(biz: G2bOp["biz"], prespecNo: string): Promise<LinkResult> {
  let key: string;
  try {
    key = sosEnv().dataGoKrKey;
  } catch {
    return { ok: false, code: "NO_KEY" };
  }
  const qs = new URLSearchParams(buildLinkQuery(prespecNo));
  qs.set("serviceKey", key);
  try {
    const res = await fetch(`${G2B_BASE}${linkEndpoint(biz)}?${qs}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, code: "HTTP" };
    const parsed = parseG2bResponse(await res.json());
    if (!parsed.ok) return { ok: false, code: parsed.code };
    return { ok: true, planNo: pickPlanNo(parsed) };
  } catch {
    return { ok: false, code: "NETWORK" };
  }
}
