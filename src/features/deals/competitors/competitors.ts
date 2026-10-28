// 경쟁사 기록 — 입력 검사와 경쟁사별 전적. 순수 함수 (테스트: competitors.test.ts)
import { parseWon } from "../money";

export const COMPETITOR_NAME_MAX = 100;
export const COMPETITOR_NOTE_MAX = 300;
export const MAX_COMPETITORS_PER_DEAL = 15;

export type CompetitorInput = { name: string; bid: string; isWinner: boolean; note: string };
export type CompetitorRow = { name: string; bid_amount: number | null; is_winner: boolean; note: string | null };

export function toCompetitorRow(input: CompetitorInput): { ok: true; row: CompetitorRow } | { ok: false; error: string } {
  const name = typeof input?.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
  if (!name) return { ok: false, error: "경쟁사 이름을 입력하세요." };
  if (name.length > COMPETITOR_NAME_MAX) return { ok: false, error: `경쟁사 이름은 ${COMPETITOR_NAME_MAX}자 이하로 입력하세요.` };
  const bid = parseWon(typeof input.bid === "string" ? input.bid : "");
  if (!bid.ok || (bid.value != null && bid.value < 0)) return { ok: false, error: "제안가는 숫자로 입력하세요 (예: 3억, 50000000)." };
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > COMPETITOR_NOTE_MAX) return { ok: false, error: `메모는 ${COMPETITOR_NOTE_MAX}자 이하로 입력하세요.` };
  return { ok: true, row: { name, bid_amount: bid.value, is_winner: input.isWinner === true, note: note || null } };
}

export type Outcome = "won" | "lost" | "open";
export type CompetitorEntry = { dealId: string; name: string; isWinner: boolean };
export type CompetitorStat = { name: string; deals: number; weWon: number; theyWon: number; otherWon: number; open: number };

const key = (s: string) => s.replace(/\s|\(주\)|주식회사|㈜/g, "").toLowerCase();

/**
 * 경쟁사별 전적 — 그 경쟁사와 맞붙은 사업 중
 * 우리가 수주(weWon) / 그 경쟁사가 낙찰(theyWon) / 다른 곳이 가져감(otherWon, 실주인데 그 경쟁사가 낙찰자가 아님) / 진행 중(open)
 */
export function competitorStats(entries: CompetitorEntry[], outcomes: Map<string, Outcome>): CompetitorStat[] {
  const map = new Map<string, CompetitorStat & { seen: Set<string> }>();
  for (const e of entries) {
    const k = key(e.name);
    if (!k) continue;
    const s = map.get(k) ?? { name: e.name, deals: 0, weWon: 0, theyWon: 0, otherWon: 0, open: 0, seen: new Set<string>() };
    if (s.seen.has(e.dealId)) continue;
    s.seen.add(e.dealId);
    const o = outcomes.get(e.dealId) ?? "open";
    s.deals += 1;
    if (o === "won") s.weWon += 1;
    else if (o === "lost") {
      if (e.isWinner) s.theyWon += 1;
      else s.otherWon += 1;
    } else s.open += 1;
    map.set(k, s);
  }
  return [...map.values()]
    .map((s) => ({ name: s.name, deals: s.deals, weWon: s.weWon, theyWon: s.theyWon, otherWon: s.otherWon, open: s.open }))
    .sort((a, b) => b.deals - a.deals || b.theyWon - a.theyWon || a.name.localeCompare(b.name));
}
