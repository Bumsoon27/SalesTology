// 고객사(파트너사) 상세 — 그 회사가 걸린 사업 요약. 순수 함수 (테스트: detail.test.ts)
// 고객사로 맡은 사업 + SI·매입처로 참여한 사업 (같은 사업은 한 번, 역할은 모아 둔다)
import type { DealStage, DealStatus } from "@/features/deals/types";

export type CompanyRole = "customer" | "si" | "supplier";

export type CompanyDeal = {
  id: string;
  name: string;
  stage: DealStage;
  status: DealStatus;
  amount: number | null;
  gp: number | null;
  ownerId: string;
  owner: string;
  lastActivityAt: string;
  roles: CompanyRole[];
};

const WON = new Set<DealStage>(["won", "fulfillment", "billing"]);
export const isWonDeal = (d: Pick<CompanyDeal, "stage" | "status">) => d.status !== "lost" && WON.has(d.stage);
export const isOpenDeal = (d: Pick<CompanyDeal, "stage" | "status">) => (d.status === "active" || d.status === "on_hold") && !WON.has(d.stage);

/** 같은 사업이 고객사·SI 로 동시에 걸릴 수 있다 → 하나로 합치고 역할만 모은다 */
export function mergeDeals(rows: CompanyDeal[]): CompanyDeal[] {
  const map = new Map<string, CompanyDeal>();
  for (const r of rows) {
    const prev = map.get(r.id);
    map.set(r.id, prev ? { ...prev, roles: [...new Set([...prev.roles, ...r.roles])] } : r);
  }
  // 진행 중 → 수주 → 그 외, 같은 묶음은 최근 활동 순
  const group = (d: CompanyDeal) => (isOpenDeal(d) ? 0 : isWonDeal(d) ? 1 : 2);
  return [...map.values()].sort((a, b) => group(a) - group(b) || b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export type CompanySummary = { total: number; open: number; openAmount: number; won: number; wonAmount: number; wonGp: number; lost: number; owners: string[] };

export function summarizeCompany(deals: CompanyDeal[]): CompanySummary {
  const open = deals.filter(isOpenDeal);
  const won = deals.filter(isWonDeal);
  return {
    total: deals.length,
    open: open.length,
    openAmount: open.reduce((s, d) => s + Number(d.amount ?? 0), 0),
    won: won.length,
    wonAmount: won.reduce((s, d) => s + Number(d.amount ?? 0), 0),
    wonGp: won.reduce((s, d) => s + Number(d.gp ?? 0), 0),
    lost: deals.filter((d) => d.status === "lost").length,
    owners: [...new Set(deals.map((d) => d.owner))],
  };
}

export type Contact = { name: string; count: number; lastOn: string; kinds: string[] };

/** 고객 쪽 접점 — 활동 기록의 '누구와'(counterpart)를 사람별로. 이름은 공백·대소문자 무시로 합친다. 최근 접촉 순 */
export function contactsFrom(notes: { counterpart: string | null; occurredOn: string; kind: string }[]): Contact[] {
  const map = new Map<string, Contact>();
  for (const n of notes) {
    const name = n.counterpart?.trim();
    if (!name) continue;
    const k = name.replace(/\s/g, "").toLowerCase();
    const c = map.get(k) ?? { name, count: 0, lastOn: n.occurredOn, kinds: [] };
    c.count += 1;
    if (n.occurredOn > c.lastOn) c.lastOn = n.occurredOn;
    if (!c.kinds.includes(n.kind)) c.kinds.push(n.kind);
    map.set(k, c);
  }
  return [...map.values()].sort((a, b) => b.lastOn.localeCompare(a.lastOn) || b.count - a.count);
}
