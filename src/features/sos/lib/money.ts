/** 금액(원) 파싱. 0·빈값·음수·비숫자는 "미공개"로 보고 null */
export function parseAmount(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  } else return null;
  return Number.isFinite(n) && n > 0 ? n : null;
}
