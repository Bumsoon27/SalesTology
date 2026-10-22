import { describe, expect, it } from "vitest";
import { parseKst } from "../lib/date";
import { buildQuery, endpointFor, G2B_OPS, normalize, parseG2bResponse, stripPersonal } from "./g2b";
import bidFixture from "./__fixtures__/bid.json";
import errorFixture from "./__fixtures__/error.json";
import planFixture from "./__fixtures__/plan.json";
import prespecFixture from "./__fixtures__/prespec.json";

const prespecItem = prespecFixture.response.body.items[0];
const bidItem = bidFixture.response.body.items[0];
const planItem = planFixture.response.body.items[0];

describe("g2b 정규화", () => {
  it("사전규격", () => {
    const pre = normalize("g2b_prespec", prespecItem)!;
    expect(pre.externalId).toBe(prespecItem.bfSpecRgstNo);
    expect(pre.chainPrespecNo).toBe(pre.externalId);
    expect(pre.deadlineType).toBe("prespec_opinion");
    expect(pre.deadlineAt).toBe(parseKst(prespecItem.opninRgstClseDt));
    expect(pre.budget).toBeNull(); // 첫 항목 asignBdgtAmt "0" → 미공개
    expect(JSON.stringify(pre.payload)).not.toMatch(/ofcl|TelNo/i);
  });

  it("입찰공고", () => {
    const bid = normalize("g2b_bid", bidItem)!;
    expect(bid.chainBidNo).toBe(bid.externalId);
    expect(bid.version).toBe(Number(bidItem.bidNtceOrd));
    expect(bid.deadlineType).toBe("bid_close");
    expect(bid.chainPrespecNo).toBe(bidItem.bfSpecRgstNo || null);
    expect(bid.budget).toBe(Number(bidItem.asignBdgtAmt));
  });

  it("발주계획", () => {
    const plan = normalize("g2b_plan", planItem)!;
    expect(plan.orderMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(plan.budget === null || plan.budget > 0).toBe(true);
    expect(plan.chainPlanNo).toBe(plan.externalId);
    expect(plan.deadlineAt).toBeNull();
  });

  it("정정공고는 version 이 오르고, 예산 0 은 null, 필수값 없으면 null", () => {
    expect(normalize("g2b_bid", { ...bidItem, bidNtceOrd: "002" })!.version).toBe(2);
    expect(normalize("g2b_plan", { ...planItem, sumOrderAmt: "0" })!.budget).toBeNull();
    expect(normalize("g2b_bid", { ...bidItem, bidNtceNo: "" })).toBeNull();
    expect(normalize("g2b_prespec", { ...prespecItem, prdctClsfcNoNm: "" })).toBeNull();
  });

  it("전 항목 정규화 가능, 개인정보 제거", () => {
    for (const [s, f] of [
      ["g2b_plan", planFixture],
      ["g2b_prespec", prespecFixture],
      ["g2b_bid", bidFixture],
    ] as const) {
      for (const it of f.response.body.items) expect(normalize(s, it)).not.toBeNull();
    }
    expect(stripPersonal({ a: 1, ofclNm: "x", bidNtceTelNo: "1", dminsttEmailAdrs: "e" })).toEqual({ a: 1 });
  });
});

describe("g2b 응답·쿼리", () => {
  it("오류 응답", () => {
    expect(parseG2bResponse(errorFixture)).toEqual({ ok: false, code: "08", message: expect.any(String) });
  });

  it("정상·빈 응답", () => {
    const r = parseG2bResponse(prespecFixture);
    expect(r.ok && r.items.length).toBe(prespecFixture.response.body.items.length);
    const empty = parseG2bResponse({ response: { header: { resultCode: "00" }, body: { items: "", totalCount: 0 } } });
    expect(empty).toEqual({ ok: true, items: [], totalCount: 0 });
    expect(parseG2bResponse("x").ok).toBe(false);
  });

  it("buildQuery", () => {
    const range = { from: new Date("2026-10-21T00:00:00+09:00"), to: new Date("2026-10-22T00:00:00+09:00") };
    expect(buildQuery({ source: "g2b_plan", biz: "Thng" }, range, 1, 999)).toMatchObject({
      inqryDiv: "1",
      orderBgnYm: "202610",
      orderEndYm: "202704",
      type: "json",
      pageNo: "1",
      numOfRows: "999",
    });
    const q = buildQuery({ source: "g2b_bid", biz: "Servc" }, range, 2, 100);
    expect(q).toMatchObject({ inqryBgnDt: "202610210000", inqryEndDt: "202610220000", pageNo: "2" });
    expect(q).not.toHaveProperty("serviceKey");
  });

  it("G2B_OPS·endpoint", () => {
    expect(G2B_OPS).toHaveLength(6);
    expect(endpointFor({ source: "g2b_prespec", biz: "Servc" })).toBe(
      "/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServc",
    );
    expect(endpointFor({ source: "g2b_plan", biz: "Thng" })).toBe("/ao/OrderPlanSttusService/getOrderPlanSttusListThng");
    expect(endpointFor({ source: "g2b_bid", biz: "Thng" })).toBe("/ad/BidPublicInfoService/getBidPblancListInfoThng");
  });
});
