import { daysUntil } from "../lib/date";
import { STAGE_RANK, type DeadlineType, type NormalizedItem, type SourceId, type Stage } from "../types";

export type LeadDraft = {
  chainKey: string;
  title: string;
  orgName: string;
  orgCode: string | null;
  stage: Stage;
  budget: number | null;
  orderMonth: string | null;
  nextDeadlineAt: string | null;
  nextDeadlineType: DeadlineType | null;
  items: NormalizedItem[];
};

const SOURCE_STAGE: Record<SourceId, Stage> = {
  g2b_plan: "plan",
  g2b_prespec: "prespec",
  g2b_bid: "bid",
};

// 항목이 가진 번호들 — 종류 접두사를 붙여 서로 다른 필드의 같은 문자열이 충돌하지 않게 한다
function typedKeys(i: NormalizedItem): string[] {
  const keys: string[] = [];
  if (i.chainPlanNo) keys.push(`plan:${i.chainPlanNo}`);
  if (i.chainPrespecNo) keys.push(`prespec:${i.chainPrespecNo}`);
  if (i.chainBidNo) keys.push(`bid:${i.chainBidNo}`);
  return keys;
}

/** 번호를 하나라도 공유하면 같은 묶음. 같은 (source, externalId) 는 version 큰 것만 남긴다. */
export function groupChains(items: NormalizedItem[]): NormalizedItem[][] {
  // 정정공고 등: 최신 version 만 (첫 등장 위치는 유지)
  const latest = new Map<string, NormalizedItem>();
  for (const it of items) {
    const k = `${it.source}\u0000${it.externalId}`;
    const prev = latest.get(k);
    if (!prev || it.version > prev.version) latest.set(k, it);
  }
  const deduped = [...latest.values()];

  // 유니온-파인드 (항목 인덱스 기준)
  const parent = deduped.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const firstOwner = new Map<string, number>();
  deduped.forEach((it, idx) => {
    for (const key of typedKeys(it)) {
      const owner = firstOwner.get(key);
      if (owner === undefined) firstOwner.set(key, idx);
      else {
        const a = find(owner);
        const b = find(idx);
        // 작은 인덱스를 루트로 — 등장 순서가 안정적으로 유지된다
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  });

  const groups = new Map<number, NormalizedItem[]>();
  deduped.forEach((it, idx) => {
    const root = find(idx);
    const g = groups.get(root);
    if (g) g.push(it);
    else groups.set(root, [it]);
  });
  return [...groups.values()];
}

function smallest(values: (string | null)[]): string | null {
  const present = values.filter((v): v is string => !!v).sort();
  return present[0] ?? null;
}

/** 묶음 안에서 가장 이른 단계의 번호로 키를 만든다 (plan > prespec > bid). */
export function chainKeyOf(group: NormalizedItem[]): string {
  const plan = smallest(group.map((i) => i.chainPlanNo));
  if (plan) return `plan:${plan}`;
  const pre = smallest(group.map((i) => i.chainPrespecNo));
  if (pre) return `prespec:${pre}`;
  const bid = smallest(group.map((i) => i.chainBidNo));
  if (bid) return `bid:${bid}`;
  // 번호 없는 단독 항목 — 출처+외부ID 로 고정
  const first = group[0];
  return `${SOURCE_STAGE[first.source]}:${first.externalId}`;
}

/** 한 번 정해진 키는 바뀌지 않게, 저장된 리드와 겹치는 번호가 있으면 그 키를 쓴다. */
export function resolveChainKey(group: NormalizedItem[], existingKeys: Map<string, string>): string {
  // plan → prespec → bid 순으로 먼저 찾은 것
  for (const field of ["chainPlanNo", "chainPrespecNo", "chainBidNo"] as const) {
    for (const it of group) {
      const no = it[field];
      const hit = no ? existingKeys.get(no) : undefined;
      if (hit) return hit;
    }
  }
  return chainKeyOf(group);
}

export function toLeadDraft(group: NormalizedItem[], chainKey: string, today: string): LeadDraft {
  // 가장 진행된 단계 항목 (동률이면 version 큰 것, 그다음 먼저 나온 것)
  const top = group.reduce((best, it) => {
    const r = STAGE_RANK[SOURCE_STAGE[it.source]];
    const br = STAGE_RANK[SOURCE_STAGE[best.source]];
    return r > br || (r === br && it.version > best.version) ? it : best;
  });
  const stage = SOURCE_STAGE[top.source];

  const bySource = (s: SourceId) => group.filter((i) => i.source === s);
  const firstBudget = (s: SourceId) => bySource(s).find((i) => i.budget != null)?.budget ?? null;
  const budget = firstBudget("g2b_prespec") ?? firstBudget("g2b_bid") ?? firstBudget("g2b_plan");

  const orderMonth = bySource("g2b_plan").find((i) => i.orderMonth)?.orderMonth ?? null;

  let next: { at: string; type: DeadlineType | null } | null = null;
  for (const it of group) {
    if (!it.deadlineAt || daysUntil(it.deadlineAt, today) < 0) continue;
    if (!next || Date.parse(it.deadlineAt) < Date.parse(next.at)) next = { at: it.deadlineAt, type: it.deadlineType };
  }

  return {
    chainKey,
    title: top.title,
    orgName: top.orgName,
    orgCode: top.orgCode ?? group.find((i) => i.orgCode)?.orgCode ?? null,
    stage,
    budget,
    orderMonth,
    nextDeadlineAt: next?.at ?? null,
    nextDeadlineType: next?.type ?? null,
    items: group,
  };
}
