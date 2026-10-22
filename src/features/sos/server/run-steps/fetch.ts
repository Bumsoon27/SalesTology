import "server-only";

import { matchKeywords } from "../../analysis/keywords";
import { displayOrgName, normalizeOrgName } from "../../analysis/org";
import { normalize, stripPersonal, type G2bOp } from "../../collectors/g2b";
import { fetchG2bPage } from "../../collectors/g2b-fetch";
import { todayInSeoul } from "../../lib/date";
import { afterFetch, opLabel } from "../../run/steps";
import type { NormalizedItem } from "../../types";
import { chunk, IN_LIST, IN_LIST_NAMES, loadKeywords, must, type Admin } from "../db";
import { cursorRange, type StepContext, type StepResult } from "./types";

const ROWS = 999;

export type OpStats = { fetched?: number; matched?: number; pages?: number; skipped?: boolean; error?: string };

/** 나라장터 한 쪽 수집 → 원본 저장. 오류 응답이면 기록만 하고 이 업무의 남은 쪽은 건너뛴다 */
export async function fetchStep(ctx: StepContext, op: G2bOp, page: number): Promise<StepResult> {
  const { admin, teamId, now } = ctx;
  const label = opLabel(op);
  const prev = (ctx.stats[label] ?? {}) as OpStats;
  const range = cursorRange(ctx);
  const day = { from: todayInSeoul(range.from), to: todayInSeoul(range.to) };

  // 다른 부문(또는 이전 실행)이 같은 범위를 이미 받았으면 원본을 재사용한다 (API 한도 절약)
  if (page === 1) {
    const done = must<{ id: string }[]>(
      "수집 기록 조회",
      await admin
        .from("sos_fetch_log")
        .select("id")
        .eq("source", label)
        .lte("range_from", day.from)
        .gte("range_to", day.to)
        .limit(1),
    );
    if (done && done.length > 0) {
      return { cursor: ctx.cursor, stats: { ...ctx.stats, [label]: { skipped: true, fetched: 0, matched: 0 } } };
    }
  }

  const res = await fetchG2bPage(op, range, page, ROWS);
  if (!res.ok) {
    // 메시지는 g2b-fetch 가 키·URL 없이 만든다
    return { cursor: ctx.cursor, stats: { ...ctx.stats, [label]: { ...prev, error: `${res.code}: ${res.message}` } } };
  }

  const items = latestOnly(res.items.map((r) => normalize(op.source, r)).filter((i): i is NormalizedItem => i !== null));
  const keywords = await loadKeywords(admin, teamId);
  const matched = new Set(
    items
      .filter((it) => {
        const m = matchKeywords(it.matchText, keywords);
        return m.matched.length > 0 && !m.excluded;
      })
      .map((it) => it.externalId),
  );

  const orgIdOf = await upsertOrgs(admin, items);
  await upsertRawItems(admin, op, items, matched, orgIdOf, now);

  const stats: OpStats = {
    fetched: (prev.fetched ?? 0) + items.length,
    matched: (prev.matched ?? 0) + matched.size,
    pages: page,
  };
  return { cursor: afterFetch(ctx.cursor, op, page, res.totalCount, ROWS), stats: { ...ctx.stats, [label]: stats } };
}

/** 한 쪽 안에 같은 공고가 여러 차수로 오면 큰 차수만 (한 upsert 에 같은 키가 두 번 있으면 DB 오류) */
function latestOnly(items: NormalizedItem[]): NormalizedItem[] {
  const m = new Map<string, NormalizedItem>();
  for (const it of items) {
    const p = m.get(it.externalId);
    if (!p || it.version > p.version) m.set(it.externalId, it);
  }
  return [...m.values()];
}

type OrgLookup = (it: NormalizedItem) => string | null;

/** 기관 upsert — 코드가 있으면 코드로, 없으면 표준화 이름으로 맞춘다 */
async function upsertOrgs(admin: Admin, items: NormalizedItem[]): Promise<OrgLookup> {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();

  const coded = new Map<string, { org_code: string; name: string; normalized_name: string }>();
  const named = new Map<string, { name: string; normalized_name: string }>();
  for (const it of items) {
    if (!it.orgName && !it.orgCode) continue;
    const name = displayOrgName(it.orgName) || it.orgCode || "";
    const normalized = normalizeOrgName(it.orgName || name);
    if (it.orgCode) coded.set(it.orgCode, { org_code: it.orgCode, name, normalized_name: normalized });
    else if (normalized) named.set(normalized, { name, normalized_name: normalized });
  }

  for (const rows of chunk([...coded.values()], 500)) {
    const saved = must<{ id: string; org_code: string }[]>(
      "기관 저장",
      await admin.from("sos_orgs").upsert(rows, { onConflict: "org_code" }).select("id, org_code"),
    );
    for (const o of saved ?? []) byCode.set(o.org_code, o.id);
  }

  for (const names of chunk([...named.keys()], IN_LIST_NAMES)) {
    const found = must<{ id: string; normalized_name: string }[]>(
      "기관 조회",
      await admin.from("sos_orgs").select("id, normalized_name").in("normalized_name", names),
    );
    for (const o of found ?? []) if (!byName.has(o.normalized_name)) byName.set(o.normalized_name, o.id);
    const missing = names.filter((n) => !byName.has(n)).map((n) => named.get(n)!);
    if (missing.length > 0) {
      const inserted = must<{ id: string; normalized_name: string }[]>(
        "기관 추가",
        await admin.from("sos_orgs").insert(missing).select("id, normalized_name"),
      );
      for (const o of inserted ?? []) byName.set(o.normalized_name, o.id);
    }
  }

  return (it) => (it.orgCode ? byCode.get(it.orgCode) : byName.get(normalizeOrgName(it.orgName))) ?? null;
}

/**
 * 원본 upsert (source, external_id). 저장된 차수가 더 크면 건너뛴다 (정정공고 역행 방지).
 * payload 는 이 부문 키워드에 맞은 건만 넣고, 안 맞은 건은 payload 칸을 아예 보내지 않아 기존 값을 지우지 않는다.
 */
async function upsertRawItems(
  admin: Admin,
  op: G2bOp,
  items: NormalizedItem[],
  matched: Set<string>,
  orgIdOf: OrgLookup,
  now: Date,
): Promise<void> {
  const stored = new Map<string, number>();
  for (const ids of chunk(items.map((i) => i.externalId), IN_LIST)) {
    const rows = must<{ external_id: string; version: number }[]>(
      "원본 차수 조회",
      await admin.from("sos_raw_items").select("external_id, version").eq("source", op.source).in("external_id", ids),
    );
    for (const r of rows ?? []) stored.set(r.external_id, r.version);
  }
  const fresh = items.filter((it) => (stored.get(it.externalId) ?? -1) <= it.version);

  const toRow = (it: NormalizedItem) => {
    const row: Record<string, unknown> = {
      source: it.source,
      external_id: it.externalId,
      version: it.version,
      title: it.title,
      org_name: it.orgName || null,
      org_code: it.orgCode,
      org_id: orgIdOf(it),
      chain_prespec_no: it.chainPrespecNo,
      chain_bid_no: it.chainBidNo,
      budget: it.budget,
      published_at: it.publishedAt,
      deadline_at: it.deadlineAt,
      deadline_type: it.deadlineType,
      url: it.url,
      match_text: it.matchText,
      fetched_at: now.toISOString(),
    };
    // 사전규격의 발주계획 번호는 연결 단계가 채운다 — 다시 받아도 지우지 않는다
    if (it.source !== "g2b_prespec") row.chain_plan_no = it.chainPlanNo;
    return row;
  };

  const withPayload = fresh.filter((it) => matched.has(it.externalId)).map((it) => ({ ...toRow(it), payload: stripPersonal(it.payload) }));
  const withoutPayload = fresh.filter((it) => !matched.has(it.externalId)).map(toRow);
  for (const rows of [...chunk(withPayload, 500), ...chunk(withoutPayload, 500)]) {
    must("원본 저장", await admin.from("sos_raw_items").upsert(rows, { onConflict: "source,external_id" }));
  }
}
