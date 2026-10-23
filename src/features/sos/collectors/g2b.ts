// 나라장터 수집기 — 엔드포인트·쿼리·응답 파싱·정규화 (순수, I/O 없음).
// 실측 메모 (2026-10-22, 실제 키):
//  - numOfRows=999 허용됨 (사전규격 하루치 261건이 한 번에 옴). 999 초과는 시험하지 않았다.
//  - 연결 API(CntrctProcssIntgOpenService)는 inqryDiv=1 에 bfSpecRgstNo 만 주면 0건이다 (inqryDiv=1 은 입찰공고번호 기준).
//    번호 → 연결 조회는 inqryDiv=1 + bidNtceNo, 또는 inqryDiv=2 + bfSpecRgstNo 로 1건이 나온다.
//  - 입찰공고 응답은 bfSpecRgstNo·orderPlanUntyNo 를 이미 가지므로(없으면 빈 문자열) 연결 API 는 보조용.
import { parseAmount } from "../lib/money";
import { parseKst, toG2bDateTime } from "../lib/date";
import type { DeadlineType, NormalizedItem, SourceId } from "../types";

export type G2bOp = { source: SourceId; biz: "Thng" | "Servc" };

const SOURCES: SourceId[] = ["g2b_plan", "g2b_prespec", "g2b_bid"];
export const G2B_OPS: G2bOp[] = SOURCES.flatMap((source) =>
  (["Thng", "Servc"] as const).map((biz) => ({ source, biz })),
);

export const G2B_BASE = "https://apis.data.go.kr/1230000";

export function endpointFor(op: G2bOp): string {
  switch (op.source) {
    case "g2b_plan":
      return `/ao/OrderPlanSttusService/getOrderPlanSttusList${op.biz}`;
    case "g2b_prespec":
      return `/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfo${op.biz}`;
    case "g2b_bid":
      return `/ad/BidPublicInfoService/getBidPblancListInfo${op.biz}`;
  }
}

/** serviceKey 는 넣지 않는다 (g2b-fetch.ts 에서 붙임) */
export function buildQuery(
  op: G2bOp,
  range: { from: Date; to: Date },
  page: number,
  rows: number,
): Record<string, string> {
  const base = { inqryDiv: "1", type: "json", pageNo: String(page), numOfRows: String(rows) };
  if (op.source === "g2b_plan") {
    // 발주계획은 월 단위 조회: 시작 달부터 6개월 뒤 달까지
    const bgn = toG2bDateTime(range.from).slice(0, 6);
    const t = Number(bgn.slice(0, 4)) * 12 + (Number(bgn.slice(4)) - 1) + 6;
    const end = `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, "0")}`;
    return { ...base, orderBgnYm: bgn, orderEndYm: end };
  }
  return { ...base, inqryBgnDt: toG2bDateTime(range.from), inqryEndDt: toG2bDateTime(range.to) };
}

export type G2bParsed =
  | { ok: true; items: Record<string, unknown>[]; totalCount: number }
  | { ok: false; code: string; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseG2bResponse(json: unknown): G2bParsed {
  if (!isObj(json)) return { ok: false, code: "PARSE", message: "응답 형식이 올바르지 않습니다" };
  const err = json["nkoneps.com.response.ResponseError"];
  const response = isObj(json.response) ? json.response : isObj(err) ? err : null;
  const header = response && isObj(response.header) ? response.header : null;
  if (!response || !header) return { ok: false, code: "PARSE", message: "응답 헤더가 없습니다" };
  const code = String(header.resultCode ?? "");
  if (code !== "00") {
    return { ok: false, code: code || "PARSE", message: String(header.resultMsg ?? "나라장터 오류") };
  }
  const body = isObj(response.body) ? response.body : {};
  // 결과 없음일 때 items 가 "" 로 오는 경우가 있다
  let raw: unknown = body.items;
  if (isObj(raw) && "item" in raw) raw = raw.item;
  const items = Array.isArray(raw) ? raw.filter(isObj) : isObj(raw) ? [raw] : [];
  return { ok: true, items, totalCount: Number(body.totalCount ?? items.length) || 0 };
}

// 공무원 이름·연락처, 집행관명(exctvNm)
const PERSONAL = /ofcl|TelNo|EmailAdrs|exctvNm/i;

/** 공무원 개인정보 필드 제거 (원본 저장 전 반드시 통과) */
export function stripPersonal(item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([k]) => !PERSONAL.test(k)));
}

const str = (v: unknown): string | null => {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
};

const joinText = (item: Record<string, unknown>, keys: string[]): string =>
  keys.map((k) => str(item[k])).filter(Boolean).join(" ");

const MATCH_KEYS = [
  "prdctClsfcNoNm",
  "dtilPrdctClsfcNoNm",
  "specCntnts",
  "usgCntnts",
  "prdctDtlList",
  "purchsObjPrdctList",
];

export function normalize(source: SourceId, raw: Record<string, unknown>): NormalizedItem | null {
  const item = stripPersonal(raw);
  const common = (title: string) => ({
    matchText: [title, joinText(item, MATCH_KEYS)].filter(Boolean).join(" "),
    payload: item,
  });

  if (source === "g2b_plan") {
    const id = str(item.orderPlanUntyNo);
    const title = str(item.bizNm);
    if (!id || !title) return null;
    const year = str(item.orderYear);
    const mnth = str(item.orderMnth);
    return {
      source,
      externalId: id,
      version: 0,
      title,
      orgName: str(item.orderInsttNm) ?? "",
      orgCode: str(item.orderInsttCd),
      chainPlanNo: id,
      chainPrespecNo: null,
      chainBidNo: null,
      budget: parseAmount(item.sumOrderAmt),
      publishedAt: parseKst(str(item.nticeDt)),
      deadlineAt: null,
      deadlineType: null,
      orderMonth: year && mnth ? `${year}-${mnth.padStart(2, "0")}` : null,
      url: str(item.orderPlanDtlUrl),
      ...common(title),
    };
  }

  if (source === "g2b_prespec") {
    const id = str(item.bfSpecRgstNo);
    const title = str(item.prdctClsfcNoNm);
    if (!id || !title) return null;
    const deadline = parseKst(str(item.opninRgstClseDt));
    return {
      source,
      externalId: id,
      version: 0,
      title,
      orgName: str(item.rlDminsttNm) ?? str(item.orderInsttNm) ?? "",
      orgCode: null,
      chainPlanNo: null,
      chainPrespecNo: id,
      chainBidNo: null,
      budget: parseAmount(item.asignBdgtAmt),
      publishedAt: parseKst(str(item.rcptDt)) ?? parseKst(str(item.rgstDt)),
      deadlineAt: deadline,
      deadlineType: deadline ? ("prespec_opinion" satisfies DeadlineType) : null,
      orderMonth: null,
      url: str(item.specDocFileUrl1),
      ...common(title),
    };
  }

  const id = str(item.bidNtceNo);
  const title = str(item.bidNtceNm);
  if (!id || !title) return null;
  const deadline = parseKst(str(item.bidClseDt));
  const ord = Number(str(item.bidNtceOrd) ?? 0);
  return {
    source,
    externalId: id,
    version: Number.isFinite(ord) ? ord : 0,
    title,
    orgName: str(item.dminsttNm) ?? "",
    orgCode: str(item.dminsttCd),
    chainPlanNo: str(item.orderPlanUntyNo),
    chainPrespecNo: str(item.bfSpecRgstNo),
    chainBidNo: id,
    budget: parseAmount(item.asignBdgtAmt) ?? parseAmount(item.presmptPrce),
    publishedAt: parseKst(str(item.bidNtceDt)),
    deadlineAt: deadline,
    deadlineType: deadline ? ("bid_close" satisfies DeadlineType) : null,
    orderMonth: null,
    url: str(item.bidNtceDtlUrl),
    ...common(title),
  };
}
