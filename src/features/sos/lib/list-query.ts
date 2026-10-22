// /sos 목록 주소 조건 — 읽기·만들기 (순수). team 은 여기서 믿지 않는다: requireSosTeam 이 검증한다
import type { LeadStatus } from "../types";

export type ListQuery = {
  team: string | null;
  view: "deal" | "org";
  status: LeadStatus[];
  minScore?: number;
  deadlineWithin?: number;
};

type Params = Record<string, string | string[] | undefined>;

const STATUSES: LeadStatus[] = ["new", "reviewing", "on_hold", "dismissed", "converted"];
export const MIN_SCORE_OPTIONS = [30, 50, 70] as const;
export const DEADLINE_OPTIONS = [3, 7, 14] as const;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function pick<T extends number>(v: string | undefined, allowed: readonly T[]): T | undefined {
  const n = Number(v);
  return (allowed as readonly number[]).includes(n) ? (n as T) : undefined;
}

export function parseListQuery(p: Params): ListQuery {
  const team = first(p.team)?.trim();
  return {
    team: team ? team : null,
    view: first(p.view) === "org" ? "org" : "deal",
    status: all(p.status).filter((s): s is LeadStatus => (STATUSES as string[]).includes(s)),
    minScore: pick(first(p.min), MIN_SCORE_OPTIONS),
    deadlineWithin: pick(first(p.due), DEADLINE_OPTIONS),
  };
}

/** 지금 조건에 patch 를 덮은 /sos 주소 */
export function listHref(q: ListQuery, patch: Partial<ListQuery>): string {
  const n = { ...q, ...patch };
  const sp = new URLSearchParams();
  if (n.team) sp.set("team", n.team);
  if (n.view !== "deal") sp.set("view", n.view);
  for (const s of n.status) sp.append("status", s);
  if (n.minScore) sp.set("min", String(n.minScore));
  if (n.deadlineWithin) sp.set("due", String(n.deadlineWithin));
  const s = sp.toString();
  return s ? `/sos?${s}` : "/sos";
}
