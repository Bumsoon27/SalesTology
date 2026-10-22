import "server-only";

import { redirect } from "next/navigation";
import { requireUser, type CurrentUser } from "@/shared/auth/current-user";
import { createClient } from "@/shared/supabase/server";
import { resolveSosTeam } from "../lib/team";

export type SosContext = { user: CurrentUser; teamId: string; isAdminView: boolean };

/**
 * SOS 부문 결정. 관리자 클라이언트 경로의 team_id 는 반드시 여기서만 얻는다 (요청값은 검증용으로만 쓴다).
 * member 는 자기 부문 고정, admin 은 실제로 있는 부문만 고를 수 있다.
 */
export async function requireSosTeam(requested?: string | null): Promise<SosContext> {
  const user = await requireUser();
  // 빈 문자열은 "선택 안 함"
  const wanted = typeof requested === "string" && requested.trim() !== "" ? requested.trim() : null;

  let teamIds: string[] = [];
  if (user.role === "admin") {
    // 관리자는 teams RLS 로 전체 부문이 보인다
    const supabase = await createClient();
    const { data } = await supabase.from("teams").select("id");
    teamIds = (data ?? []).map((t: { id: string }) => t.id);
  }

  const r = resolveSosTeam({ role: user.role, teamId: user.teamId }, wanted, teamIds);
  if (!r.ok) redirect("/sos?error=team");
  return { user, teamId: r.teamId, isAdminView: r.isAdminView };
}
