"use server";

// 월 목표 저장 — 부문은 서버에서 정한다(요청값 아님). 권한은 RLS: 부문 목표는 부문 구성원·관리자, 개인 목표는 본인·관리자
import { refresh } from "next/cache";
import { requireUser } from "@/shared/auth/current-user";
import { createClient } from "@/shared/supabase/server";
import { parseWon } from "@/features/deals/money";
import { validMonth } from "./targets";

export type TargetResult = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 여러 달을 한 번에 저장. amount 가 비면 그 달 목표를 지운다 */
export async function saveTargets(ownerId: string | null, entries: { month: string; amount: string }[]): Promise<TargetResult> {
  const user = await requireUser();
  if (!user.teamId) return { ok: false, error: "부문에 소속된 사용자만 목표를 정할 수 있습니다." };
  if (ownerId !== null && (typeof ownerId !== "string" || !UUID.test(ownerId))) return { ok: false, error: "잘못된 요청입니다." };
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 12) return { ok: false, error: "잘못된 요청입니다." };

  const rows: { month: string; amount: number | null }[] = [];
  for (const e of entries) {
    if (!validMonth(e?.month ?? "")) return { ok: false, error: "월 형식이 올바르지 않습니다." };
    const v = parseWon(e.amount ?? "");
    if (!v.ok || (v.value != null && v.value < 0)) return { ok: false, error: `${Number(e.month.slice(5, 7))}월 목표: 숫자로 입력하세요 (예: 3억, 50000000).` };
    rows.push({ month: e.month, amount: v.value });
  }

  const supabase = await createClient();
  for (const r of rows) {
    const base = supabase.from("sales_targets").select("id").eq("team_id", user.teamId).eq("month", r.month);
    const { data: existing, error: readErr } = await (ownerId ? base.eq("owner_id", ownerId) : base.is("owner_id", null)).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    const id = (existing as { id: string } | null)?.id;
    const res =
      r.amount == null
        ? id
          ? await supabase.from("sales_targets").delete().eq("id", id)
          : { error: null }
        : id
          ? await supabase.from("sales_targets").update({ amount: r.amount }).eq("id", id)
          : await supabase.from("sales_targets").insert({ team_id: user.teamId, owner_id: ownerId, month: r.month, amount: r.amount });
    if (res.error) return { ok: false, error: res.error.code === "42501" ? "이 목표를 바꿀 권한이 없습니다." : res.error.message };
  }
  refresh();
  return { ok: true };
}
