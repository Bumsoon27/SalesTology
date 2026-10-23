import "server-only";

import { createClient } from "@/shared/supabase/server";
import { DEFAULT_TEAM_SETTINGS, type ChangeAction } from "../lib/keyword-edit";
import type { RunMode } from "../lib/run-view";
import type { LeadStatus, Stage, Tier } from "../types";
import { chunk, IN_LIST } from "./db";
import { one, type One } from "./embed";
import { check } from "./queries";
import type { RunStatus } from "./rows";

// 설정·실행 기록 화면 조회. 로그인 사용자 클라이언트(RLS)로 읽고, requireSosTeam 이 정한 teamId 조건도 명시한다.

export type SettingsKeyword = { id: string; term: string; tier: Tier; weight: number | null; active: boolean; productIds: string[] };
export type SettingsProduct = { id: string; name: string; vendor: string | null };
export type SettingsChange = {
  id: number;
  action: ChangeAction;
  before: unknown;
  after: unknown;
  createdAt: string;
  actorName: string | null;
  term: string | null;
};
export type SettingsData = {
  keywords: SettingsKeyword[];
  products: SettingsProduct[];
  changes: SettingsChange[];
  settings: { prespecAlertDays: number; aiSummaryTopN: number };
};

// 변경 이력은 최근 것만 보여 준다
const CHANGE_LIMIT = 50;

/** 설정 화면 — 살아 있는 키워드(연결 제품 포함)·제품·최근 변경 이력·부문 설정 */
export async function getSettingsData(teamId: string): Promise<SettingsData> {
  const supabase = await createClient();
  const [kw, pr, ch, st] = await Promise.all([
    supabase
      .from("sos_keywords")
      .select("id, term, tier, weight, active, sos_keyword_products(product_id)")
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .order("created_at"),
    supabase.from("sos_products").select("id, name, vendor").eq("team_id", teamId).order("name"),
    supabase
      .from("sos_keyword_changes")
      .select("id, action, before, after, created_at, actor:profiles!actor_id(name), sos_keywords(term)")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CHANGE_LIMIT),
    supabase.from("sos_team_settings").select("prespec_alert_days, ai_summary_top_n").eq("team_id", teamId).maybeSingle(),
  ]);
  check("키워드 조회", kw.error);
  check("제품 조회", pr.error);
  check("변경 이력 조회", ch.error);
  check("부문 설정 조회", st.error);

  type KwRow = Omit<SettingsKeyword, "productIds"> & { sos_keyword_products: { product_id: string }[] | null };
  type ChRow = {
    id: number;
    action: ChangeAction;
    before: unknown;
    after: unknown;
    created_at: string;
    actor: One<{ name: string }>;
    sos_keywords: One<{ term: string }>;
  };
  const s = st.data as { prespec_alert_days: number; ai_summary_top_n: number } | null;

  return {
    keywords: ((kw.data ?? []) as unknown as KwRow[]).map(({ sos_keyword_products, ...k }) => ({
      ...k,
      productIds: (sos_keyword_products ?? []).map((l) => l.product_id),
    })),
    products: (pr.data ?? []) as SettingsProduct[],
    changes: ((ch.data ?? []) as unknown as ChRow[]).map((c) => ({
      id: c.id,
      action: c.action,
      before: c.before,
      after: c.after,
      createdAt: c.created_at,
      actorName: one(c.actor)?.name ?? null,
      term: one(c.sos_keywords)?.term ?? null,
    })),
    // 시드 뒤에 생긴 부문은 행이 없다 — 기본값
    settings: s
      ? { prespecAlertDays: s.prespec_alert_days, aiSummaryTopN: s.ai_summary_top_n }
      : { prespecAlertDays: DEFAULT_TEAM_SETTINGS.prespecAlertDays, aiSummaryTopN: DEFAULT_TEAM_SETTINGS.aiSummaryTopN },
  };
}

export type RunHistoryItem = {
  id: string;
  mode: RunMode;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  starterName: string | null;
  stats: Record<string, unknown> | null;
};

type RunRow = {
  id: string;
  mode: RunMode;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  stats: Record<string, unknown> | null;
  starter: One<{ name: string }>;
};

const RUN_COLUMNS = "id, mode, status, started_at, finished_at, stats, starter:profiles!started_by(name)";
const toRun = (r: RunRow): RunHistoryItem => ({
  id: r.id,
  mode: r.mode,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  starterName: one(r.starter)?.name ?? null,
  stats: r.stats,
});

// 실행 기록 목록 최대 건수 (오래된 실행은 보관 정리로 지워진다)
const RUN_LIMIT = 100;

/** 보관 중인 실행 목록 — 최근 것부터 */
export async function getRuns(teamId: string): Promise<RunHistoryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sos_runs")
    .select(RUN_COLUMNS)
    .eq("team_id", teamId)
    .order("started_at", { ascending: false })
    .limit(RUN_LIMIT);
  check("실행 기록 조회", error);
  return ((data ?? []) as unknown as RunRow[]).map(toRun);
}

export type RunLead = {
  id: string;
  title: string;
  orgName: string;
  stage: Stage;
  status: LeadStatus;
  score: number;
  // 이 실행에서 처음 생긴 리드
  isNew: boolean;
};

// 한 실행의 시그널 행 상한 (리드 수 기준이 아니라 행 수)
const SIGNAL_LIMIT = 5000;

/** 한 실행과 그 실행의 시그널이 가리키는 리드. 다른 부문의 실행이면 null (화면은 404) */
export async function getRunWithLeads(teamId: string, runId: string): Promise<{ run: RunHistoryItem; leads: RunLead[] } | null> {
  const supabase = await createClient();
  const run = await supabase.from("sos_runs").select(RUN_COLUMNS).eq("team_id", teamId).eq("id", runId).maybeSingle();
  check("실행 조회", run.error);
  if (!run.data) return null;

  const sig = await supabase
    .from("sos_signals")
    .select("lead_id")
    .eq("team_id", teamId)
    .eq("run_id", runId)
    .not("lead_id", "is", null)
    .limit(SIGNAL_LIMIT);
  check("실행 시그널 조회", sig.error);
  const leadIds = [...new Set(((sig.data ?? []) as { lead_id: string }[]).map((s) => s.lead_id))];

  type LeadRow = {
    id: string;
    title: string;
    stage: Stage;
    status: LeadStatus;
    score: number;
    first_run_id: string | null;
    sos_orgs: One<{ name: string }>;
  };
  // in() 목록은 주소에 실리므로 나눠 읽는다
  const parts = await Promise.all(
    chunk(leadIds, IN_LIST).map((ids) =>
      supabase
        .from("sos_leads")
        .select("id, title, stage, status, score, first_run_id, sos_orgs(name)")
        .eq("team_id", teamId)
        .is("merged_into_id", null)
        .in("id", ids),
    ),
  );
  const rows: LeadRow[] = [];
  for (const p of parts) {
    check("실행 리드 조회", p.error);
    rows.push(...((p.data ?? []) as unknown as LeadRow[]));
  }
  const leads = rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      orgName: one(r.sos_orgs)?.name ?? "",
      stage: r.stage,
      status: r.status,
      score: r.score,
      isNew: r.first_run_id === runId,
    }))
    // 새 리드 먼저, 그다음 점수순
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.score - a.score);
  return { run: toRun(run.data as unknown as RunRow), leads };
}
