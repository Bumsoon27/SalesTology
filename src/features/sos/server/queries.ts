import "server-only";

import { connection } from "next/server";
import { createClient } from "@/shared/supabase/server";
import { deadlineWindow, todayInSeoul } from "../lib/date";
import { evidenceList, groupProducts, type EvidenceRow, type ProductLink } from "../lib/lead-view";
import { statusCondition } from "../lib/list-query";
import type { DeadlineType, LeadDetail, LeadListItem, LeadStatus, SourceId, Stage, Tier } from "../types";
import { SosDbError } from "./db";
import { one, type One } from "./embed";
import type { RunStatus } from "./rows";

// 목록 화면 조회. 로그인 사용자 클라이언트(RLS)로 읽고, requireSosTeam 이 정한 teamId 조건도 명시한다.
export type { LeadDetail, LeadListItem };

export type LeadFilter = {
  view: "deal" | "org";
  status?: LeadStatus[];
  minScore?: number;
  // 다음 마감이 오늘부터 n일 안
  deadlineWithin?: number;
};

export type LastRun = {
  id: string;
  mode: "collect" | "reanalyze";
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  starterName: string | null;
  created: number;
  updated: number;
};

/** SOS 테이블이 아직 DB 에 없다 (마이그레이션 전) */
export class SosNotReadyError extends Error {
  constructor() {
    super("SOS 데이터베이스가 아직 준비되지 않았습니다");
    this.name = "SosNotReadyError";
  }
}

type PgError = { message: string; code?: string };

// PGRST205: 스키마 캐시에 테이블 없음, 42P01: 테이블 없음
export function check(where: string, error: PgError | null) {
  if (!error) return;
  if (error.code === "PGRST205" || error.code === "42P01") throw new SosNotReadyError();
  throw new SosDbError(where, error);
}

// 목록 한 번에 보여 줄 최대 건수 (점수 상위부터)
const LIST_LIMIT = 300;

type LeadListRow = {
  id: string;
  title: string;
  org_id: string | null;
  company_id: string | null;
  stage: Stage;
  status: LeadStatus;
  score: number;
  budget: number | string | null;
  next_deadline_at: string | null;
  next_deadline_type: DeadlineType | null;
  summary: string | null;
  summary_source: "ai" | "template" | null;
  has_new_progress: boolean;
  keyword_mismatch: boolean;
  updated_at: string;
  sos_orgs: One<{ name: string }>;
  assignee: One<{ name: string }>;
};

/** 부문의 사업 리드 — 숨김·합쳐진 리드 제외, 점수 내림차순. 기관별 묶기는 화면이 groupByOrg 로 한다 */
export async function getLeads(teamId: string, f: LeadFilter): Promise<LeadListItem[]> {
  await connection();
  const supabase = await createClient();
  let q = supabase
    .from("sos_leads")
    .select(
      "id, title, org_id, company_id, stage, status, score, budget, next_deadline_at, next_deadline_type, summary, summary_source, has_new_progress, keyword_mismatch, updated_at, sos_orgs(name), assignee:profiles!assignee_id(name)",
    )
    .eq("team_id", teamId)
    .eq("kind", "deal")
    .eq("hidden", false)
    .is("merged_into_id", null);
  const st = statusCondition(f.status ?? []);
  q = "only" in st ? q.in("status", st.only) : q.neq("status", st.exclude);
  if (typeof f.minScore === "number" && f.minScore > 0) q = q.gte("score", f.minScore);
  if (typeof f.deadlineWithin === "number" && f.deadlineWithin > 0) {
    // KST 달력 기준 — 목록의 D-n 표시와 같은 날짜 경계
    const w = deadlineWindow(todayInSeoul(new Date()), f.deadlineWithin);
    q = q.gte("next_deadline_at", w.from).lt("next_deadline_at", w.before);
  }
  const { data, error } = await q
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  check("리드 목록 조회", error);

  return ((data ?? []) as unknown as LeadListRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    orgName: one(r.sos_orgs)?.name ?? "",
    orgId: r.org_id,
    companyId: r.company_id,
    stage: r.stage,
    status: r.status,
    score: r.score,
    budget: r.budget === null ? null : Number(r.budget),
    nextDeadlineAt: r.next_deadline_at,
    nextDeadlineType: r.next_deadline_type,
    summary: r.summary,
    summarySource: r.summary_source,
    hasNewProgress: r.has_new_progress,
    keywordMismatch: r.keyword_mismatch,
    assigneeName: one(r.assignee)?.name ?? null,
    updatedAt: r.updated_at,
  }));
}

type RunListRow = {
  id: string;
  mode: "collect" | "reanalyze";
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  stats: Record<string, unknown> | null;
  starter: One<{ name: string }>;
};

/** 마지막으로 끝난 실행 (진행 중 제외) */
export async function getLastRun(teamId: string): Promise<LastRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sos_runs")
    .select("id, mode, status, started_at, finished_at, stats, starter:profiles!started_by(name)")
    .eq("team_id", teamId)
    .neq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  check("마지막 실행 조회", error);
  if (!data) return null;
  const r = data as unknown as RunListRow;
  const analyze = (r.stats?.analyze ?? {}) as { created?: number; updated?: number };
  return {
    id: r.id,
    mode: r.mode,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    starterName: one(r.starter)?.name ?? null,
    created: analyze.created ?? 0,
    updated: analyze.updated ?? 0,
  };
}

/** 진행 중인 실행 id — 화면이 이어서 진행한다 */
export async function getRunningRun(teamId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sos_runs")
    .select("id")
    .eq("team_id", teamId)
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  check("진행 중 실행 조회", error);
  return (data as { id: string } | null)?.id ?? null;
}

export type TeamOption = { id: string; name: string };

/** 관리자 부문 선택용 (teams RLS — 관리자는 전체가 보인다) */
export async function getTeams(): Promise<TeamOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("teams").select("id, name").order("name");
  check("부문 목록 조회", error);
  return (data ?? []) as TeamOption[];
}

type LeadDetailRow = Omit<LeadListRow, "assignee"> & {
  expected_order_month: string | null;
  matched_keyword_ids: string[] | null;
  assignee_id: string | null;
  memo: string | null;
  converted_deal_id: string | null;
  assignee: One<{ name: string }>;
};

// 한 리드에 보여 줄 근거 시그널 행 수 상한 (실행마다 같은 원본이 다시 걸린다)
const SIGNAL_LIMIT = 200;

/** 리드 상세 — 다른 부문의 리드는 없는 것으로 본다 (null) */
export async function getLeadDetail(teamId: string, leadId: string): Promise<LeadDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sos_leads")
    .select(
      "id, title, org_id, company_id, stage, status, score, budget, expected_order_month, next_deadline_at, next_deadline_type, matched_keyword_ids, summary, summary_source, has_new_progress, keyword_mismatch, assignee_id, memo, converted_deal_id, updated_at, sos_orgs(name), assignee:profiles!assignee_id(name)",
    )
    .eq("team_id", teamId)
    .eq("id", leadId)
    .maybeSingle();
  check("리드 상세 조회", error);
  if (!data) return null;
  const r = data as unknown as LeadDetailRow;
  // in() 목록은 주소에 실리므로 길이를 제한한다
  const kwIds = (r.matched_keyword_ids ?? []).slice(0, 100);

  const [kw, links, sig, mem, deal] = await Promise.all([
    kwIds.length
      ? supabase.from("sos_keywords").select("id, term, tier").eq("team_id", teamId).in("id", kwIds)
      : Promise.resolve({ data: [], error: null }),
    kwIds.length
      ? supabase
          .from("sos_keyword_products")
          .select("keyword_id, sos_products!inner(id, name, vendor, team_id)")
          .in("keyword_id", kwIds)
          .eq("sos_products.team_id", teamId)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("sos_signals")
      .select("raw_item_id, sos_raw_items(source, title, published_at, url)")
      .eq("team_id", teamId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(SIGNAL_LIMIT),
    supabase.from("profiles").select("id, name").eq("team_id", teamId).eq("is_active", true).order("name"),
    // A 는 사업을 soft delete 하고 deals RLS 가 지운 행을 숨긴다 — 보이는지만 확인 (읽기 전용)
    r.converted_deal_id
      ? supabase.from("deals").select("id").eq("id", r.converted_deal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  check("일치 키워드 조회", kw.error);
  check("제안 제품 조회", links.error);
  check("근거 시그널 조회", sig.error);
  check("담당자 후보 조회", mem.error);
  check("전환 사업 확인", deal.error);

  const keywords = (kw.data ?? []) as { id: string; term: string; tier: Tier }[];
  const productLinks: ProductLink[] = (
    (links.data ?? []) as unknown as { keyword_id: string; sos_products: One<{ id: string; name: string; vendor: string | null }> }[]
  ).flatMap((l) => {
    const p = one(l.sos_products);
    return p ? [{ keywordId: l.keyword_id, product: { id: p.id, name: p.name, vendor: p.vendor } }] : [];
  });
  type SignalRow = {
    raw_item_id: string;
    sos_raw_items: One<{ source: SourceId; title: string; published_at: string | null; url: string | null }>;
  };
  const evidence: EvidenceRow[] = ((sig.data ?? []) as unknown as SignalRow[]).flatMap((s) => {
    const raw = one(s.sos_raw_items);
    return raw ? [{ rawItemId: s.raw_item_id, source: raw.source, title: raw.title, publishedAt: raw.published_at, url: raw.url }] : [];
  });

  const members = (mem.data ?? []) as { id: string; name: string }[];
  // 비활성이 된 담당자도 선택칸에 이름이 보이게 둔다 (다시 고르지는 못한다)
  const assigneeName = one(r.assignee)?.name;
  if (r.assignee_id && !members.some((m) => m.id === r.assignee_id)) {
    members.unshift({ id: r.assignee_id, name: `${assigneeName ?? "알 수 없음"} (비활성)` });
  }

  return {
    id: r.id,
    title: r.title,
    orgName: one(r.sos_orgs)?.name ?? "",
    companyId: r.company_id,
    stage: r.stage,
    status: r.status,
    score: r.score,
    budget: r.budget === null ? null : Number(r.budget),
    expectedOrderMonth: r.expected_order_month,
    nextDeadlineAt: r.next_deadline_at,
    nextDeadlineType: r.next_deadline_type,
    summary: r.summary,
    summarySource: r.summary_source,
    hasNewProgress: r.has_new_progress,
    keywordMismatch: r.keyword_mismatch,
    assigneeId: r.assignee_id,
    memo: r.memo,
    convertedDealId: r.converted_deal_id,
    convertedDealMissing: !!r.converted_deal_id && !deal.data,
    updatedAt: r.updated_at,
    keywords,
    products: groupProducts(productLinks, keywords),
    signals: evidenceList(evidence),
    members,
  };
}
