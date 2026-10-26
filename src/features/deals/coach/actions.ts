"use server";

// 영업기회 AI 코칭 (상세 패널 하단). 권한은 RLS — 볼 수 있는 사업만 코칭할 수 있다.
//   peek     : 지금 신호와 같은 지난 결과가 있으면 보여준다 (모델 호출·기록 없음)
//   generate : 같은 신호 결과가 있으면 그것, 없으면 새로 만든다
//   refresh  : 같은 신호라도 새로 만든다 (하루 상한 안에서)
import { createClient } from "@/shared/supabase/server";
import { requireUser } from "@/shared/auth/current-user";
import { loadNodeDetail } from "../detail";
import { todayInSeoul } from "../status";
import { parseAdvice, ruleBasedAdvice, type Advice } from "./advice";
import { askCoach, coachProvider } from "./provider";
import { buildCoachSignals, signalsKey, type CoachSignals } from "./signals";

/** 사용자별 하루 모델 호출 상한 */
const DAILY_LIMIT = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CoachResult =
  | {
      ok: true;
      advice: Advice | null;
      source: "llm" | "rules" | null;
      model: string | null;
      createdAt: string | null;
      /** 모델에 보낸(보낼) 정보 — 화면에서 그대로 보여준다 */
      signals: CoachSignals;
      /** sLLM 이 설정돼 있는지 (없으면 규칙 기반) */
      llmAvailable: boolean;
      /** 오늘 남은 모델 호출 수 */
      remaining: number;
      note?: string;
    }
  | { ok: false; error: string };

export async function getCoaching(dealId: string, mode: "peek" | "generate" | "refresh" = "peek"): Promise<CoachResult> {
  if (typeof dealId !== "string" || !UUID.test(dealId)) return { ok: false, error: "잘못된 요청입니다." };
  if (mode !== "peek" && mode !== "generate" && mode !== "refresh") return { ok: false, error: "잘못된 요청입니다." };

  const [user, detail] = await Promise.all([requireUser(), loadNodeDetail(`d:${dealId}`)]);
  if (detail.kind !== "deal") return { ok: false, error: "사업을 찾을 수 없습니다." };
  if (!detail.aiCoachEnabled) return { ok: false, error: "이 부문은 관리자가 AI 코칭을 꺼 두었습니다." };

  const today = todayInSeoul();
  const signals = buildCoachSignals(
    {
      stage: detail.stage,
      status: detail.status,
      contractType: detail.contractType,
      amount: detail.amount,
      gp: detail.gp,
      lastActivityAt: detail.lastActivityAt,
      periodStart: detail.periodStart,
      periodEnd: detail.periodEnd,
      tasks: detail.tasks,
      issues: detail.issues,
      parties: detail.parties,
      notes: detail.notes.map((n) => ({ kind: n.kind, occurredOn: n.occurredOn, counterpart: n.counterpart })),
      staleAfterDays: detail.staleAfterDays,
    },
    today,
  );
  const key = signalsKey(signals);
  const provider = coachProvider();
  const supabase = await createClient();

  // 오늘(서울) 내가 만든 코칭 수
  const dayStart = new Date(`${today}T00:00:00+09:00`).toISOString();
  const { count: usedToday } = await supabase
    .from("deal_coaching")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("source", "llm")
    .gte("created_at", dayStart);
  const remaining = Math.max(0, DAILY_LIMIT - (usedToday ?? 0));
  const base = { ok: true as const, signals, llmAvailable: !!provider, remaining };

  const { data: cached } = await supabase
    .from("deal_coaching")
    .select("source, model, advice, created_at")
    .eq("deal_id", dealId)
    .eq("signals_key", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached && mode !== "refresh") {
    return { ...base, advice: cached.advice as Advice, source: cached.source as "llm" | "rules", model: cached.model, createdAt: cached.created_at };
  }
  if (mode === "peek") return { ...base, advice: null, source: null, model: null, createdAt: null };

  // 모델 호출 (설정돼 있고 상한 안일 때만) → 실패하면 규칙 기반
  let advice: Advice | null = null;
  let source: "llm" | "rules" = "rules";
  let model: string | null = null;
  let note: string | undefined;
  if (provider && remaining > 0) {
    const r = await askCoach(signals);
    const parsed = r ? parseAdvice(r.text) : null;
    if (parsed) {
      advice = parsed;
      source = "llm";
      model = r!.model;
    } else note = "모델 응답을 받지 못해 규칙 기반 코칭을 보여드립니다.";
  } else if (provider) note = `오늘 AI 코칭 한도(${DAILY_LIMIT}회)를 다 써서 규칙 기반 코칭을 보여드립니다.`;
  if (!advice) advice = ruleBasedAdvice(signals);

  const { data: saved, error } = await supabase
    .from("deal_coaching")
    .insert({ deal_id: dealId, source, model, signals_key: key, advice })
    .select("created_at")
    .single();
  if (error) console.error(`[coach] 저장 실패: ${error.code ?? ""}`); // 본문·신호는 로그에 남기지 않는다

  return {
    ...base,
    remaining: source === "llm" ? Math.max(0, remaining - 1) : remaining,
    advice,
    source,
    model,
    createdAt: saved?.created_at ?? new Date().toISOString(),
    note,
  };
}
