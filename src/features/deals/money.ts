// 금액 입력(원) 해석 — 등록 화면·상세 패널 수정이 같이 쓴다. 순수 함수 (테스트: money.test.ts)
//
// 받는 형식: "150000000", "150,000,000", "150,000,000원", "₩150,000,000", "1.5억", "1억 5000만", "1,500만원"
// 빈 값은 null (입력 안 함)

const UNIT: Record<string, number> = { 억: 100_000_000, 만: 10_000 };

export type MoneyResult = { ok: true; value: number | null } | { ok: false };

export function parseWon(raw: string | null | undefined, opts: { allowNegative?: boolean } = {}): MoneyResult {
  let s = String(raw ?? "")
    .replace(/[,\s₩]/g, "")
    .replace(/원$/, "");
  if (s === "") return { ok: true, value: null };

  let sign = 1;
  if (s.startsWith("-")) {
    if (!opts.allowNegative) return { ok: false };
    sign = -1;
    s = s.slice(1);
  }

  // 숫자만
  if (/^\d+$/.test(s)) return { ok: true, value: sign * Number(s) };

  // 억·만 단위: "1.5억", "1억5000만", "1500만", "3억2000"
  const m = /^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)만)?(\d+)?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return { ok: false };
  const value = (m[1] ? Number(m[1]) * UNIT.억 : 0) + (m[2] ? Number(m[2]) * UNIT.만 : 0) + (m[3] ? Number(m[3]) : 0);
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value: sign * Math.round(value) };
}
