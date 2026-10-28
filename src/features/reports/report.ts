// 실적 리포트 — 수주 시점·월별 수주·영업대표별·승률. 순수 함수 (테스트: report.test.ts)
// 참고: Salesforce 리포트(수주 금액 추이·담당자별 실적·Win rate)
//
// 수주 시점: 변경 이력(activity_log)에서 사업이 처음으로 '수주 이후 단계'(수주·이행·빌링)에 들어간 때.
//           처음부터 그 단계로 등록했으면 등록 시점. 이력이 없으면 등록일.
// 실주 시점: 상태가 '실주'로 바뀐 때.
// 지금 수주 이후 단계가 아니거나(되돌림) 실주·삭제된 사업은 수주로 세지 않는다.
import { seoulDay } from "@/features/deals/status";
import type { DealStage, DealStatus } from "@/features/deals/types";

const WON = new Set<DealStage>(["won", "fulfillment", "billing"]);

export type ReportDeal = {
  id: string;
  name: string;
  stage: DealStage;
  status: DealStatus;
  amount: number | null;
  gp?: number | null;
  /** 경쟁입찰·수의계약 (퍼널의 입찰 단계) */
  contract_type?: "competitive" | "negotiated";
  lost_reason?: string | null;
  created_at: string;
  owner_id: string;
  owner: string;
  customer: { name: string };
};

export type DealEvent = {
  deal_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

export type Win = { dealId: string; name: string; customer: string; ownerId: string; owner: string; on: string; amount: number; gp: number | null };
export type Loss = { dealId: string; ownerId: string; on: string };

export function computeOutcomes(deals: ReportDeal[], events: DealEvent[]): { wins: Win[]; losses: Loss[] } {
  const byDeal = new Map<string, DealEvent[]>();
  for (const e of events) byDeal.set(e.deal_id, [...(byDeal.get(e.deal_id) ?? []), e]);
  for (const list of byDeal.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const wins: Win[] = [];
  const losses: Loss[] = [];
  for (const d of deals) {
    const ev = byDeal.get(d.id) ?? [];
    if (d.status === "lost") {
      const lostAt = ev.find((e) => e.after?.status === "lost")?.created_at ?? d.created_at;
      losses.push({ dealId: d.id, ownerId: d.owner_id, on: seoulDay(lostAt) });
      continue;
    }
    if (!WON.has(d.stage)) continue;
    const entered = ev.find(
      (e) =>
        (e.action === "create" && WON.has(e.after?.stage as DealStage)) ||
        (e.action === "stage_change" && WON.has(e.after?.stage as DealStage) && !WON.has(e.before?.stage as DealStage)),
    );
    wins.push({
      dealId: d.id,
      name: d.name,
      customer: d.customer.name,
      ownerId: d.owner_id,
      owner: d.owner,
      on: seoulDay(entered?.created_at ?? d.created_at),
      amount: Number(d.amount ?? 0),
      gp: d.gp == null ? null : Number(d.gp),
    });
  }
  return { wins: wins.sort((a, b) => b.on.localeCompare(a.on)), losses };
}

export type Period = { from: string; to: string; label: string };

/** 이번 달·이번 분기·올해 (서울 날짜 기준, 끝은 포함) */
export function periods(today: string): { month: Period; quarter: Period; year: Period } {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const q = Math.floor((m - 1) / 3);
  return {
    month: { from: `${y}-${pad(m)}-01`, to: today, label: `${m}월` },
    quarter: { from: `${y}-${pad(q * 3 + 1)}-01`, to: today, label: `${q + 1}분기` },
    year: { from: `${y}-01-01`, to: today, label: `${y}년` },
  };
}

export type Totals = { count: number; amount: number; gp: number; gpRate: number | null };

export function totals(wins: Win[], p: Period): Totals {
  const inP = wins.filter((w) => w.on >= p.from && w.on <= p.to);
  const amount = inP.reduce((s, w) => s + w.amount, 0);
  const withGp = inP.filter((w) => w.gp != null);
  const gp = withGp.reduce((s, w) => s + (w.gp ?? 0), 0);
  const gpBase = withGp.reduce((s, w) => s + w.amount, 0);
  return { count: inP.length, amount, gp, gpRate: gpBase > 0 ? Math.round((gp / gpBase) * 1000) / 10 : null };
}

export type MonthRow = { month: string; label: string; count: number; amount: number; gp: number };

/** 최근 n개월 (오래된 달부터), 수주 없는 달도 0 으로 */
export function monthly(wins: Win[], today: string, n = 12): MonthRow[] {
  const [y, m] = today.split("-").map(Number);
  const rows: MonthRow[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    rows.push({ month: key, label: `${d.getUTCMonth() + 1}월`, count: 0, amount: 0, gp: 0 });
  }
  const idx = new Map(rows.map((r, i) => [r.month, i]));
  for (const w of wins) {
    const i = idx.get(w.on.slice(0, 7));
    if (i == null) continue;
    rows[i].count += 1;
    rows[i].amount += w.amount;
    rows[i].gp += w.gp ?? 0;
  }
  return rows;
}

export type OwnerRow = { ownerId: string; owner: string; count: number; amount: number; gp: number };

export function byOwner(wins: Win[], p: Period): OwnerRow[] {
  const map = new Map<string, OwnerRow>();
  for (const w of wins) {
    if (w.on < p.from || w.on > p.to) continue;
    const r = map.get(w.ownerId) ?? { ownerId: w.ownerId, owner: w.owner, count: 0, amount: 0, gp: 0 };
    r.count += 1;
    r.amount += w.amount;
    r.gp += w.gp ?? 0;
    map.set(w.ownerId, r);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** 승률 — 기간 안에 결론 난(수주·실주) 사업 중 수주 비율(건수). 결론 난 사업이 없으면 null */
export function winRate(wins: Win[], losses: Loss[], from: string, to: string): { rate: number | null; won: number; lost: number } {
  const won = wins.filter((w) => w.on >= from && w.on <= to).length;
  const lost = losses.filter((l) => l.on >= from && l.on <= to).length;
  return { rate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null, won, lost };
}

/**
 * 평균·중앙 수주 기간(일) — 등록일 → 수주일, 기간(from~to) 안에 수주한 사업. 없으면 null.
 * 처음부터 수주 이후 단계로 등록한 사업(이미 따낸 사업을 나중에 입력)은 기간이 0일로 잡혀 빼야 한다 → events 로 거른다
 */
export function salesCycle(wins: Win[], deals: Pick<ReportDeal, "id" | "created_at">[], from: string, to: string, events: DealEvent[] = []): { avg: number; median: number; count: number } | null {
  const created = new Map(deals.map((d) => [d.id, seoulDay(d.created_at)]));
  const enteredWon = new Set(events.filter((e) => e.action === "create" && WON.has(e.after?.stage as DealStage)).map((e) => e.deal_id));
  const days = wins
    .filter((w) => w.on >= from && w.on <= to && created.has(w.dealId) && !enteredWon.has(w.dealId))
    .map((w) => Math.max(0, Math.round((Date.parse(`${w.on}T00:00:00Z`) - Date.parse(`${created.get(w.dealId)}T00:00:00Z`)) / 86_400_000)))
    .sort((a, b) => a - b);
  if (!days.length) return null;
  const mid = Math.floor(days.length / 2);
  return {
    avg: Math.round(days.reduce((s, n) => s + n, 0) / days.length),
    median: days.length % 2 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2),
    count: days.length,
  };
}
