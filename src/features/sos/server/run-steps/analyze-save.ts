import "server-only";

import { groupChains, resolveChainKey, toLeadDraft, type LeadDraft } from "../../analysis/chain";
import { isKeywordHit, matchKeywords } from "../../analysis/keywords";
import { applyLeadUpdate } from "../../analysis/lead-update";
import { scoreLead } from "../../analysis/score";
import { DAY_MS, todayInSeoul } from "../../lib/date";
import { parseAmount } from "../../lib/money";
import {
  dateToMonth,
  leadFactsChanged,
  leadRowChanged,
  leadToStored,
  monthToDate,
  othersInOrg,
  rawRowToItem,
  type LeadWrite,
} from "../../run/convert";
import { continueWith, planSaveChunk } from "../../run/steps";
import { STAGE_RANK, type Keyword, type NormalizedItem } from "../../types";
import { chunk, IN_LIST, loadKeywords, loadLeads, loadOrgMembers, must, selectAll, type Admin } from "../db";
import type { LeadRow, RawItemRow } from "../rows";
import { cursorRange, type StepContext, type StepResult } from "./types";

// payload 전체 대신 발주월에 필요한 두 값만 꺼낸다 (전송량)
const RAW_COLUMNS =
  "id, source, external_id, version, title, org_name, org_code, org_id, chain_plan_no, chain_prespec_no, chain_bid_no, budget, published_at, deadline_at, deadline_type, url, match_text, fetched_at, order_year:payload->>orderYear, order_mnth:payload->>orderMnth";
// .or() 필터 문자열에 넣으므로 나라장터 번호 모양만 허용한다
const SAFE_NUMBER = /^[A-Za-z0-9_-]+$/;

const itemKey = (source: string, externalId: string) => `${source}\u0000${externalId}`;

type SaveStats = { scanned?: number; matched?: number; created?: number; updated?: number; unchanged?: number };

/**
 * 맞은 원본 → 사업 묶음 → 리드 upsert·시그널 저장. 더는 맞지 않는 기존 리드는 숨김/불일치 표시.
 * 맞은 원본을 SAVE_CHUNK 건씩 나눠 한 단계에 한 조각만 저장하고, 남으면 같은 단계를 다시 넣는다.
 * 조각마다 연결 원본을 번호로 다시 불러 묶으므로 조각 경계에 걸친 사업도 같은 묶음이 된다(upsert 로 흡수).
 * 불일치 판정은 모든 조각이 끝난 마지막에 한 번 (커서의 keptKeys 기준).
 */
export async function analyzeSaveStep(ctx: StepContext, offset = 0): Promise<StepResult> {
  const { admin, teamId, run, now } = ctx;
  const allIds = ctx.cursor.matchedIds ?? [];
  const part = planSaveChunk(allIds.length, offset);
  const first = part.start === 0;
  const today = todayInSeoul(now);
  const scopeFrom = cursorRange(ctx).from.toISOString();
  const keywords = await loadKeywords(admin, teamId);
  const kwOf = (r: RawItemRow): Keyword[] => {
    const m = matchKeywords(r.match_text ?? r.title, keywords);
    return m.excluded ? [] : m.matched;
  };

  // 1) 맞은 원본 + 번호로 이어진 원본(같은 사업의 다른 단계)
  const matched = await loadRawByIds(admin, allIds.slice(part.start, part.end));
  const related = await loadRawByNumbers(admin, numbersOf(matched));
  const rows = dedupeById([...matched, ...related]);
  const rowOf = new Map(rows.map((r) => [itemKey(r.source, r.external_id), r]));

  // 2) 기존 리드와 번호 → chain_key 맵
  const leads = await loadLeads(admin, teamId);
  const leadByKey = new Map(leads.filter((l) => l.chain_key).map((l) => [l.chain_key!, l]));
  const existingKeys = await buildExistingKeys(admin, teamId, leads, rows);

  // 3) 묶고, 같은 키로 모이는 묶음은 합친다
  const byKey = new Map<string, NormalizedItem[]>();
  for (const g of groupChains(rows.map(rawRowToItem))) {
    const key = resolveChainKey(g, existingKeys);
    byKey.set(key, [...(byKey.get(key) ?? []), ...g]);
  }
  // 이어진 원본만 있고 맞은 원본이 없는 묶음은 버린다 (다른 종류 번호가 우연히 같은 경우)
  const matchedSet = new Set(matched.map((r) => r.id));
  for (const [key, items] of byKey) {
    if (!items.some((i) => matchedSet.has(rowOf.get(itemKey(i.source, i.externalId))?.id ?? ""))) byKey.delete(key);
  }

  // 4) 겹침 점수용 기관 → 리드 집합 (이번 묶음 포함)
  // orgSignals90d = 최근 90일 같은 기관에 걸린 "다른 리드" 수(중복 없이). 설계서는 기관 시그널 건수지만
  // S1 에는 기관 시그널(kind='org')이 없고, 실행마다 시그널이 다시 쌓여 건수는 부풀므로 의도적으로 다르게 센다
  const members = await loadOrgMembers(admin, teamId, new Date(now.getTime() - 90 * DAY_MS));
  const selfId = (key: string) => leadByKey.get(key)?.id ?? `new:${key}`;
  const orgOfKey = new Map<string, string | null>();
  for (const [key, items] of byKey) {
    const org = items.map((i) => rowOf.get(itemKey(i.source, i.externalId))?.org_id).find((o) => !!o) ?? null;
    orgOfKey.set(key, org);
    if (org) members.set(org, (members.get(org) ?? new Set()).add(selfId(key)));
  }

  // 5) 리드 행 만들기 — 기존 리드는 값이 바뀐 것만 쓴다 (updated_at 이 화면의 충돌 검사 기준이라)
  // last_run_id 는 비교에서 빼므로 "마지막으로 값을 바꾼 실행"이 된다
  const newRows: Record<string, unknown>[] = [];
  const oldRows: Record<string, unknown>[] = [];
  const leadIdOf = new Map<string, string>();
  const factsChanged: string[] = [];
  for (const [key, items] of byKey) {
    const prev = leadByKey.get(key) ?? null;
    const draft = mergeWithPrev(toLeadDraft(items, key, today), prev);
    const kws = uniqueKeywords(items.map((i) => rowOf.get(itemKey(i.source, i.externalId))).flatMap((r) => (r ? kwOf(r) : [])));
    const { score } = scoreLead({ draft, matched: kws, orgSignals90d: othersInOrg(members, orgOfKey.get(key) ?? null, selfId(key)), today });
    const upd = applyLeadUpdate(prev ? leadToStored(prev) : null, { draft, matched: true });
    const write: LeadWrite = {
      org_id: orgOfKey.get(key) ?? prev?.org_id ?? null,
      title: draft.title,
      stage: draft.stage,
      budget: draft.budget,
      expected_order_month: monthToDate(draft.orderMonth),
      next_deadline_at: draft.nextDeadlineAt,
      next_deadline_type: draft.nextDeadlineAt ? draft.nextDeadlineType : null,
      matched_keyword_ids: kws.map((k) => k.id),
      score,
      hidden: upd.hidden ?? prev?.hidden ?? false,
      has_new_progress: upd.hasNewProgress ?? prev?.has_new_progress ?? false,
      keyword_mismatch: upd.keywordMismatch ?? prev?.keyword_mismatch ?? false,
    };
    const row = { team_id: teamId, chain_key: key, kind: "deal", ...write, last_run_id: run.id };
    if (prev) {
      if (leadFactsChanged(prev, write)) factsChanged.push(prev.id);
      if (leadRowChanged(prev, write)) oldRows.push(row);
      else leadIdOf.set(key, prev.id);
    } else if (upd.create) newRows.push({ ...row, status: "new", first_run_id: run.id });
  }

  // 기존 리드 행에는 status 를 넣지 않는다 — 사람이 정한 상태를 덮어쓰지 않게
  for (const batch of [...chunk(newRows, 500), ...chunk(oldRows, 500)]) {
    const saved = must<{ id: string; chain_key: string }[]>(
      "리드 저장",
      await admin.from("sos_leads").upsert(batch, { onConflict: "team_id,chain_key" }).select("id, chain_key"),
    );
    for (const l of saved ?? []) leadIdOf.set(l.chain_key, l.id);
  }

  // 6) 시그널 — 같은 실행으로 다시 저장해도(재시도·조각 겹침) 중복되지 않게 먼저 지운다
  const signals: Record<string, unknown>[] = [];
  for (const [key, items] of byKey) {
    const leadId = leadIdOf.get(key);
    if (!leadId) continue;
    for (const it of items) {
      const r = rowOf.get(itemKey(it.source, it.externalId));
      if (r) signals.push({ team_id: teamId, run_id: run.id, kind: "deal", raw_item_id: r.id, lead_id: leadId, matched_keyword_ids: kwOf(r).map((k) => k.id) });
    }
  }
  if (first) {
    must("시그널 정리", await admin.from("sos_signals").delete().eq("team_id", teamId).eq("run_id", run.id));
  } else {
    const rawIds = [...new Set(signals.map((x) => x.raw_item_id as string))];
    for (const ids of chunk(rawIds, IN_LIST)) {
      must("시그널 정리", await admin.from("sos_signals").delete().eq("team_id", teamId).eq("run_id", run.id).in("raw_item_id", ids));
    }
  }
  for (const batch of chunk(signals, 1000)) must("시그널 저장", await admin.from("sos_signals").insert(batch));

  const prevStats = (ctx.stats.analyze ?? {}) as SaveStats;
  const count = (k: "created" | "updated" | "unchanged", n: number) => (first ? 0 : (prevStats[k] ?? 0)) + n;
  const keptKeys = [...new Set([...(first ? [] : (ctx.cursor.keptKeys ?? [])), ...byKey.keys()])];
  const factsChangedIds = [...new Set([...(first ? [] : (ctx.cursor.factsChangedIds ?? [])), ...factsChanged])];
  const analyze = {
    ...prevStats,
    leads: keptKeys.length,
    created: count("created", newRows.length),
    updated: count("updated", oldRows.length),
    unchanged: count("unchanged", byKey.size - newRows.length - oldRows.length),
  };

  // 남은 조각이 있으면 이어서 저장
  if (part.next !== null) {
    return {
      cursor: continueWith({ ...ctx.cursor, keptKeys, factsChangedIds }, { kind: "analyze", save: true, offset: part.next }),
      stats: { ...ctx.stats, analyze },
    };
  }

  // 7) 더는 맞지 않는 기존 리드: 이번 범위의 원본이 걸려 있는데 이번 실행 어느 조각에도 묶이지 않은 것
  const unmatched = await markUnmatched(admin, teamId, scopeFrom, leads, new Set(keptKeys), keywords);
  return {
    cursor: { ...ctx.cursor, matchedIds: [], keptKeys: [], factsChangedIds },
    stats: { ...ctx.stats, analyze: { ...analyze, ...unmatched } },
  };
}

/** 저장된 리드보다 뒤로 가지 않게: 단계는 큰 쪽, 예산·발주월은 새 값이 없으면 기존 값 */
function mergeWithPrev(draft: LeadDraft, prev: LeadRow | null): LeadDraft {
  if (!prev) return draft;
  return {
    ...draft,
    stage: STAGE_RANK[prev.stage] > STAGE_RANK[draft.stage] ? prev.stage : draft.stage,
    budget: draft.budget ?? parseAmount(prev.budget),
    orderMonth: draft.orderMonth ?? dateToMonth(prev.expected_order_month),
  };
}

function uniqueKeywords(list: Keyword[]): Keyword[] {
  return [...new Map(list.map((k) => [k.id, k])).values()];
}

function dedupeById(rows: RawItemRow[]): RawItemRow[] {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}

function numbersOf(rows: RawItemRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) for (const n of [r.chain_plan_no, r.chain_prespec_no, r.chain_bid_no, r.external_id]) if (n) s.add(n);
  return [...s];
}

async function loadRawByIds(admin: Admin, ids: string[]): Promise<RawItemRow[]> {
  const out: RawItemRow[] = [];
  for (const part of chunk(ids, IN_LIST)) {
    out.push(...(must<RawItemRow[]>("원본 조회", await admin.from("sos_raw_items").select(RAW_COLUMNS).in("id", part)) ?? []));
  }
  return out;
}

async function loadRawByNumbers(admin: Admin, numbers: string[]): Promise<RawItemRow[]> {
  const out: RawItemRow[] = [];
  for (const part of chunk(numbers.filter((n) => SAFE_NUMBER.test(n)), IN_LIST)) {
    const list = part.join(",");
    const filter = `chain_plan_no.in.(${list}),chain_prespec_no.in.(${list}),chain_bid_no.in.(${list})`;
    out.push(...(must<RawItemRow[]>("연결 원본 조회", await admin.from("sos_raw_items").select(RAW_COLUMNS).or(filter)) ?? []));
  }
  return out;
}

/**
 * 한 번 정해진 chain_key 를 유지하기 위한 번호 → 키 맵.
 * 리드 키 자체의 번호 + 리드에 걸린 원본들의 모든 번호·external_id (단독 키 `{단계}:{externalId}` 도 찾게).
 */
async function buildExistingKeys(admin: Admin, teamId: string, leads: LeadRow[], rows: RawItemRow[]): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  const keyOfLead = new Map<string, string>();
  for (const l of leads) {
    if (!l.chain_key) continue;
    keyOfLead.set(l.id, l.chain_key);
    const no = l.chain_key.slice(l.chain_key.indexOf(":") + 1);
    if (no && !keys.has(no)) keys.set(no, l.chain_key);
  }
  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const part of chunk([...rowById.keys()], IN_LIST)) {
    const sigs = must<{ raw_item_id: string; lead_id: string | null }[]>(
      "기존 시그널 조회",
      await admin.from("sos_signals").select("raw_item_id, lead_id").eq("team_id", teamId).in("raw_item_id", part).not("lead_id", "is", null),
    );
    for (const s of sigs ?? []) {
      const key = s.lead_id ? keyOfLead.get(s.lead_id) : undefined;
      const r = rowById.get(s.raw_item_id);
      if (!key || !r) continue;
      for (const n of [r.chain_plan_no, r.chain_prespec_no, r.chain_bid_no, r.external_id]) if (n && !keys.has(n)) keys.set(n, key);
    }
  }
  return keys;
}

async function markUnmatched(
  admin: Admin,
  teamId: string,
  scopeFrom: string,
  leads: LeadRow[],
  keptKeys: Set<string>,
  keywords: Keyword[],
): Promise<{ hidden: number; mismatched: number }> {
  const inScope = await selectAll<{ lead_id: string }>("범위 시그널 조회", (from, to) =>
    admin
      .from("sos_signals")
      .select("lead_id, sos_raw_items!inner(fetched_at)")
      .eq("team_id", teamId)
      .not("lead_id", "is", null)
      .gte("sos_raw_items.fetched_at", scopeFrom)
      .order("id")
      .range(from, to),
  );
  const scoped = new Set(inScope.map((s) => s.lead_id));
  const candidates = leads.filter((l) => scoped.has(l.id) && !(l.chain_key && keptKeys.has(l.chain_key)));

  // 범위 안에 들어온 원본이 키워드 없는 연결 원본(예: 매번 다시 받는 발주계획)일 수 있다.
  // 리드에 걸린 원본을 전부 다시 맞춰 보고, 하나라도 맞으면 그대로 둔다
  const stillHit = new Set<string>();
  for (const part of chunk(candidates.map((l) => l.id), IN_LIST)) {
    const rows = await selectAll<{ lead_id: string; sos_raw_items: { title: string; match_text: string | null } | null }>(
      "리드 원본 조회",
      (from, to) =>
        admin
          .from("sos_signals")
          .select("lead_id, sos_raw_items(title, match_text)")
          .eq("team_id", teamId)
          .in("lead_id", part)
          .order("id")
          .range(from, to),
    );
    for (const r of rows) {
      const raw = r.sos_raw_items;
      if (raw && isKeywordHit(raw.match_text ?? raw.title, keywords)) stillHit.add(r.lead_id);
    }
  }

  const hide: string[] = [];
  const mismatchShow: string[] = [];
  const mismatchKeep: string[] = [];
  for (const l of candidates) {
    if (stillHit.has(l.id)) continue;
    const u = applyLeadUpdate(leadToStored(l), { draft: null, matched: false });
    // 이미 그 상태인 리드는 다시 쓰지 않는다 (updated_at)
    if (u.hidden === true) {
      if (!l.hidden) hide.push(l.id);
    } else if (u.hidden === false) {
      if (l.hidden || !l.keyword_mismatch) mismatchShow.push(l.id);
    } else if (u.keywordMismatch && !l.keyword_mismatch) mismatchKeep.push(l.id);
  }
  const apply = async (ids: string[], patch: Record<string, unknown>) => {
    for (const part of chunk(ids, IN_LIST)) must("리드 불일치 표시", await admin.from("sos_leads").update(patch).eq("team_id", teamId).in("id", part));
  };
  await apply(hide, { hidden: true });
  await apply(mismatchShow, { keyword_mismatch: true, hidden: false });
  await apply(mismatchKeep, { keyword_mismatch: true });
  return { hidden: hide.length, mismatched: mismatchShow.length + mismatchKeep.length };
}
