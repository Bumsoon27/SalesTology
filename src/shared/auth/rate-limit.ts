// 아주 단순한 메모리 기반 제한 (설계서 §5.1: 부문 코드 검증 IP당 분당 5회).
// 서버 인스턴스마다 따로 세므로 완벽하지 않다 — 트래픽이 늘면 DB/Redis 기반으로 바꾼다.
const hits = new Map<string, number[]>();

export function allow(key: string, limit = 5, windowMs = 60_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
