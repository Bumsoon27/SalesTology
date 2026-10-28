"use server";

// 경쟁사 기록 — 권한은 RLS (사업을 볼 수 있는 사람이 추가, 기록자·관리자가 지우기)
import { refresh } from "next/cache";
import { requireUser } from "@/shared/auth/current-user";
import { createClient } from "@/shared/supabase/server";
import { MAX_COMPETITORS_PER_DEAL, toCompetitorRow, type CompetitorInput } from "./competitors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export type Competitor = { id: string; name: string; bid: number | null; isWinner: boolean; note: string | null; mine: boolean };
type Result = { ok: true } | { ok: false; error: string };

export async function listCompetitors(dealId: string): Promise<{ ok: true; items: Competitor[] } | { ok: false; error: string }> {
  if (!isId(dealId)) return { ok: false, error: "잘못된 요청입니다." };
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal_competitors")
    .select("id, name, bid_amount, is_winner, note, created_by")
    .eq("deal_id", dealId)
    .order("is_winner", { ascending: false })
    .order("created_at")
    .limit(MAX_COMPETITORS_PER_DEAL);
  if (error) return { ok: false, error: "경쟁사를 불러오지 못했습니다." };
  type Row = { id: string; name: string; bid_amount: number | null; is_winner: boolean; note: string | null; created_by: string };
  return {
    ok: true,
    items: ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      name: r.name,
      bid: r.bid_amount == null ? null : Number(r.bid_amount),
      isWinner: r.is_winner,
      note: r.note,
      mine: r.created_by === user.id || user.role === "admin",
    })),
  };
}

export async function addCompetitor(dealId: string, input: CompetitorInput): Promise<Result> {
  if (!isId(dealId)) return { ok: false, error: "잘못된 요청입니다." };
  const mapped = toCompetitorRow(input);
  if (!mapped.ok) return mapped;
  const user = await requireUser();
  const supabase = await createClient();
  const { count } = await supabase.from("deal_competitors").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  if ((count ?? 0) >= MAX_COMPETITORS_PER_DEAL) return { ok: false, error: `경쟁사는 ${MAX_COMPETITORS_PER_DEAL}곳까지 기록할 수 있습니다.` };
  const { error } = await supabase.from("deal_competitors").insert({ deal_id: dealId, created_by: user.id, ...mapped.row });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 기록한 경쟁사입니다." };
    if (error.code === "42501") return { ok: false, error: "이 사업에 기록할 권한이 없습니다." };
    return { ok: false, error: "경쟁사를 기록하지 못했습니다." };
  }
  refresh();
  return { ok: true };
}

export async function deleteCompetitor(id: string): Promise<Result> {
  if (!isId(id)) return { ok: false, error: "잘못된 요청입니다." };
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("deal_competitors").delete().eq("id", id).select("id");
  if (!data?.length) return { ok: false, error: "지울 수 없습니다 (기록한 사람·관리자만)." };
  refresh();
  return { ok: true };
}
