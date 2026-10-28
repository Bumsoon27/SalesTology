// 금액 입력(원) 해석 — 등록 화면·상세 패널 수정이 같이 쓴다. 순수 함수 (테스트: money.test.ts)
//
// 받는 형식: "150000000", "150,000,000", "150,000,000원", "₩150,000,000", "1.5억", "1억 5000만", "1,500만원"
// 빈 값은 null (입력 안 함)

const UNIT: Record<string, number> = { 억: 100_000_000, 만: 10_000 };

export type MoneyResult = { ok: true; value: number | null } | { ok: false };

/** GP 는 사업 규모를 넘을 수 없다 (GP율 100% 초과 방지). 둘 중 하나라도 비었으면 검사하지 않는다 */
export function checkGp(amount: number | null, gp: number | null): string | null {
  if (amount == null || gp == null) return null;
  if (gp > amount) return "GP가 사업 규모보다 큽니다. 금액을 확인해 주세요.";
  return null;
}

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

  // 억·만 단위: "1.5억", "1억5000만", "1500만", "3억2000"(= 3억 2000만, 한국어 관용)
  const m = /^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)만)?(\d+)?$/.exec(s);
  if (!m || (!m[1] && !m[2])) return { ok: false };
  // '억' 뒤에 '만' 없이 붙은 숫자는 만 단위로 읽는다. '만' 뒤의 숫자는 원
  const tail = m[3] ? Number(m[3]) * (m[1] && !m[2] ? UNIT.만 : 1) : 0;
  const value = (m[1] ? Number(m[1]) * UNIT.억 : 0) + (m[2] ? Number(m[2]) * UNIT.만 : 0) + tail;
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value: sign * Math.round(value) };
}

/** 화면 표시용 금액 — 1억 이상은 '3.2억', 1만 이상은 '5,180만', 그 아래는 원 그대로 (음수 GP 도 같은 규칙) */
export function formatEok(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}
