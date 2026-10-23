"use server";

import { refresh } from "next/cache";
import { createDealFromLead } from "@/features/deals/api";
import { createClient } from "@/shared/supabase/server";
import { dealHref, orderMonthOf, toLeadToDealInput } from "../convert";
import { parseLeadId } from "../lib/lead-view";
import type { LeadStatus, Stage } from "../types";
import { requireSosTeam } from "./context";

// [사업으로 전환] (설계서 §6.1). A 의 createDealFromLead 만 쓴다 — deals 에 직접 INSERT 하지 않는다.
// 로그인 사용자 클라이언트(RLS)만 쓴다. 부문은 requireSosTeam 으로만 정한다.

export type ConvertLeadResult = { ok: true; href: string } | { ok: false; error: string };

const ADMIN_REFUSED = "관리자는 사업으로 전환할 수 없습니다. 부문 담당자가 전환해 주세요.";
const FAILED = { ok: false as const, error: "전환하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };

type One<T> = T | T[] | null;
type Row = {
  id: string;
  title: string;
  company_id: string | null;
  budget: number | string | null;
  expected_order_month: string | null;
  stage: Stage;
  status: LeadStatus;
  assignee_id: string | null;
  converted_deal_id: string | null;
  touched_at: string | null;
  sos_orgs: One<{ name: string }>;
};

function logDb(where: string, e: { message: string; code?: string }) {
  console.error(`[sos] ${where}: ${e.code ?? ""} ${e.message}`);
}

export async function convertLead(leadId: string, teamParam?: string | null): Promise<ConvertLeadResult> {
  const id = parseLeadId(typeof leadId === "string" ? leadId : undefined);
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  const { teamId, isAdminView } = await requireSosTeam(typeof teamParam === "string" ? teamParam : null);
  // 관리자가 고른 부문으로는 create_deal 을 부를 수 없다 (설계서 §6.1, Review Focus 4)
  if (isAdminView) return { ok: false, error: ADMIN_REFUSED };
  const supabase = await createClient();

  const cur = await supabase
    .from("sos_leads")
    .select("id, title, company_id, budget, expected_order_month, stage, status, assignee_id, converted_deal_id, touched_at, sos_orgs(name)")
    .eq("id", id)
    .eq("team_id", teamId)
    .maybeSingle();
  if (cur.error) {
    logDb("전환 전 리드 조회", cur.error);
    return FAILED;
  }
  const r = cur.data as unknown as Row | null;
  if (!r) return { ok: false, error: "리드를 찾을 수 없습니다." };
  // 이미 전환됨 — A 를 다시 부르지 않는다. 사업이 지워져 연결이 비었으면(on delete set null) 다시 만든다
  if (r.status === "converted" && r.converted_deal_id) return { ok: true, href: dealHref(r.converted_deal_id) };

  const org = Array.isArray(r.sos_orgs) ? r.sos_orgs[0] : r.sos_orgs;
  const res = await createDealFromLead(
    toLeadToDealInput({
      id: r.id,
      title: r.title,
      orgName: org?.name ?? "",
      companyId: r.company_id,
      budget: r.budget === null ? null : Number(r.budget),
      orderMonth: orderMonthOf(r.expected_order_month),
      stage: r.stage,
      assigneeId: r.assignee_id,
    }),
  );
  if (!res.ok) return { ok: false, error: res.error };

  // 사람이 손댄 시각은 처음 값만 남긴다 (보관 정리 제외 기준)
  const values = {
    status: "converted" as const,
    converted_deal_id: res.data.dealId,
    ...(r.touched_at ? {} : { touched_at: new Date().toISOString() }),
  };
  const upd = await supabase.from("sos_leads").update(values).eq("id", id).eq("team_id", teamId).select("id");
  if (upd.error || !upd.data || upd.data.length === 0) {
    if (upd.error) logDb("전환 결과 저장", upd.error);
    // 사업은 sourceRef 로 멱등이라 다시 누르면 같은 사업으로 연결된다
    return { ok: false, error: "사업은 만들었지만 리드에 연결하지 못했습니다. 다시 누르면 같은 사업으로 연결됩니다." };
  }
  refresh();
  return { ok: true, href: res.data.href };
}
