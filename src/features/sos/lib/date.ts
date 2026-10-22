// 시간대는 항상 Asia/Seoul. 외부 의존성 없이 Intl 로 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const seoulDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** now 의 서울 달력 날짜 (YYYY-MM-DD) */
export function todayInSeoul(now: Date): string {
  return seoulDate.format(now);
}

/** 나라장터 KST 문자열("2026-10-25 23:59:00" 등) → ISO. 해석 불가면 null */
export function parseKst(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", sec = "0"] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec) - KST_OFFSET_MS;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 마감 ISO 의 서울 날짜 − today(YYYY-MM-DD), 일 단위 (지났으면 음수) */
export function daysUntil(deadlineIso: string, today: string): number {
  const dl = seoulDate.format(new Date(deadlineIso));
  return Math.round((Date.parse(`${dl}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** 나라장터 조회 파라미터용 YYYYMMDDHHmm (KST) */
export function toG2bDateTime(d: Date): string {
  const k = new Date(d.getTime() + KST_OFFSET_MS).toISOString(); // UTC 필드가 곧 KST
  return k.slice(0, 16).replace(/[-T:]/g, "");
}

/** "2026-10" → "2026-Q4" */
export function quarterOf(month: string): string {
  const [y, m] = month.split("-");
  return `${y}-Q${Math.ceil(Number(m) / 3)}`;
}

/**
 * "마감 n일 안" 조회 범위 (ISO). 오늘(KST) 0시 이상, 오늘+n+1일 0시 미만 —
 * daysUntil 이 0~n 인 마감과 같다 (목록의 D-n 표시와 기준을 맞춘다).
 */
export function deadlineWindow(today: string, days: number): { from: string; before: string } {
  const start = Date.parse(`${today}T00:00:00Z`) - KST_OFFSET_MS;
  return { from: new Date(start).toISOString(), before: new Date(start + (days + 1) * DAY_MS).toISOString() };
}
