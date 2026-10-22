// 나라장터 응답 픽스처 녹화. 실행: node --env-file=.env.local src/features/sos/collectors/record-fixtures.mjs
// 키는 출력·저장하지 않는다. 개인정보 필드는 g2b.ts 의 stripPersonal 과 같은 규칙으로 제거.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.DATA_GO_KR_SERVICE_KEY;
if (!KEY) throw new Error("DATA_GO_KR_SERVICE_KEY 없음");
const BASE = "https://apis.data.go.kr/1230000";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const PERSONAL = /ofcl|TelNo|EmailAdrs/i;

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !PERSONAL.test(k)).map(([k, x]) => [k, strip(x)]));
  }
  return v;
}

const fmt = (d) => {
  const k = new Date(d.getTime() + 9 * 3600e3).toISOString();
  return k.slice(0, 16).replace(/[-T:]/g, "");
};
const to = new Date();
const from = new Date(to.getTime() - 24 * 3600e3);
const ym = fmt(from).slice(0, 6);
const endYm = (() => {
  const y = +ym.slice(0, 4), m = +ym.slice(4);
  const t = y * 12 + (m - 1) + 6;
  return `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, "0")}`;
})();

async function call(path, params) {
  const qs = new URLSearchParams({ type: "json", pageNo: "1", ...params });
  qs.set("serviceKey", KEY); // URLSearchParams 가 인코딩
  const res = await fetch(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, text: text.slice(0, 200).replace(KEY, "***") };
  }
}
const save = (name, json) => writeFileSync(join(OUT, name), JSON.stringify(strip(json), null, 2) + "\n");
const range = { inqryDiv: "1", inqryBgnDt: fmt(from), inqryEndDt: fmt(to) };

const plan = await call("/ao/OrderPlanSttusService/getOrderPlanSttusListThng", { inqryDiv: "1", orderBgnYm: ym, orderEndYm: endYm, numOfRows: "5" });
const prespec = await call("/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoThng", { ...range, numOfRows: "5" });
const bid = await call("/ad/BidPublicInfoService/getBidPblancListInfoThng", { ...range, numOfRows: "5" });
const err = await call("/ao/OrderPlanSttusService/getOrderPlanSttusListThng", { inqryDiv: "2", numOfRows: "5" });
for (const [n, r] of [["plan", plan], ["prespec", prespec], ["bid", bid], ["error", err]]) {
  if (!r.json) throw new Error(`${n} 비JSON 응답 status=${r.status} ${r.text}`);
  save(`${n}.json`, r.json);
}

// 조사: numOfRows=999 허용 여부
const big = await call("/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoThng", { ...range, numOfRows: "999" });
const bigBody = big.json?.response?.body;
console.log("999 rows:", big.json?.response?.header?.resultCode, "items:", bigBody?.items?.length, "total:", bigBody?.totalCount);

// 조사: 연결 API 가 bfSpecRgstNo 하나로 조회되는지
const spec = prespec.json?.response?.body?.items?.[0]?.bfSpecRgstNo;
const bidItem = bid.json?.response?.body?.items?.find((i) => i.bfSpecRgstNo);
for (const [label, no] of [["prespec(items[0])", spec], ["bid 가 가진 bfSpecRgstNo", bidItem?.bfSpecRgstNo]]) {
  if (!no) { console.log("연결 API:", label, "번호 없음"); continue; }
  const r = await call("/ao/CntrctProcssIntgOpenService/getCntrctProcssIntgOpenThng", { inqryDiv: "1", bfSpecRgstNo: no, numOfRows: "5" });
  const h = r.json?.response?.header ?? r.json?.["nkoneps.com.response.ResponseError"]?.header;
  console.log("연결 API:", label, h?.resultCode, h?.resultMsg, "total:", r.json?.response?.body?.totalCount);
}
console.log("counts", ["plan", "prespec", "bid"].map((n) => `${n}=${(eval(n).json.response.body.items ?? []).length}`).join(" "));
