// 계약과정통합공개 API — 사전규격 번호로 발주계획 번호를 찾는다 (순수).
// 실측: inqryDiv=2 + bfSpecRgstNo 로 1건이 나온다. inqryDiv=1 + bfSpecRgstNo 는 0건.
import type { G2bOp, G2bParsed } from "./g2b";

export function linkEndpoint(biz: G2bOp["biz"]): string {
  return `/ao/CntrctProcssIntgOpenService/getCntrctProcssIntgOpen${biz}`;
}

/** serviceKey 는 넣지 않는다 (g2b-link-fetch.ts 에서 붙임) */
export function buildLinkQuery(prespecNo: string): Record<string, string> {
  return { inqryDiv: "2", bfSpecRgstNo: prespecNo, type: "json", pageNo: "1", numOfRows: "10" };
}

export function pickPlanNo(parsed: G2bParsed): string | null {
  if (!parsed.ok) return null;
  for (const it of parsed.items) {
    const v = it.orderPlanUntyNo;
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/** 사전규격 원본의 업무구분(bsnsDivNm)으로 조회할 업무. 원본이 없으면 물품 → 용역 순으로 둘 다 */
export function linkBizOrder(payload: Record<string, unknown> | null): G2bOp["biz"][] {
  const div = typeof payload?.bsnsDivNm === "string" ? payload.bsnsDivNm.trim() : "";
  if (div === "물품") return ["Thng"];
  if (div === "용역") return ["Servc"];
  return ["Thng", "Servc"];
}
