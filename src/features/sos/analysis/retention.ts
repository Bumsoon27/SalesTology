import { DAY_MS } from "../lib/date";

const KEEP_DAYS = 14;
const KEEP_MIN = 3;

/** 정리할 실행 id. 14일 이내는 모두 보관하고, 3회 미만이면 최근 순으로 채운다(설계서 §4.3). */
export function selectRunsToPurge(runs: { id: string; startedAt: string }[], now: Date): string[] {
  const cutoff = now.getTime() - KEEP_DAYS * DAY_MS;
  const time = (r: { startedAt: string }) => Date.parse(r.startedAt);
  const keep = new Set(runs.filter((r) => time(r) >= cutoff).map((r) => r.id));
  if (keep.size < KEEP_MIN) {
    const recent = [...runs].sort((a, b) => time(b) - time(a));
    for (const r of recent) {
      if (keep.size >= KEEP_MIN) break;
      keep.add(r.id);
    }
  }
  return runs.filter((r) => !keep.has(r.id)).map((r) => r.id);
}
