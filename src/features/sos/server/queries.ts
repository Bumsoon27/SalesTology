import "server-only";

import { connection } from "next/server";
import { createClient } from "@/shared/supabase/server";
import { DAY_MS } from "../lib/date";
import type { DeadlineType, LeadListItem, LeadStatus, Stage } from "../types";
import { SosDbError } from "./db";
import type { RunStatus } from "./rows";

// 목록 화면 조회. 로그인 사용자 클라이언트(RLS)로 읽고, requireSosTeam 이 정한 teamId 조건도 명시한다.
export type { LeadListItem };

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
function check(where: string, error: PgError | null) {
  if (!error) return;
  if (error.code === "PGRST205" || error.code === "42P01") throw new SosNotReadyError();
  throw new SosDbError(where, error);
}

// 목록 한 번에 보여 줄 최대 건수 (점수 상위부터)
const LIST_LIMIT = 300;

type One<T> = T | T[] | null;
function one<T>(v: One<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

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
  if (f.status && f.status.length > 0) q = q.in("status", f.status);
  if (typeof f.minScore === "number" && f.minScore > 0) q = q.gte("score", f.minScore);
  if (typeof f.deadlineWithin === "number" && f.deadlineWithin > 0) {
    const now = Date.now();
    q = q
      .gte("next_deadline_at", new Date(now).toISOString())
      .lte("next_deadline_at", new Date(now + f.deadlineWithin * DAY_MS).toISOString());
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
