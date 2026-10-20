import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/shared/supabase/server";

export type CurrentUser = {
  id: string;
  loginId: string;
  name: string;
  role: "admin" | "member";
  teamId: string | null;
  teamName: string | null;
};

// A·B 공용: 로그인 사용자와 프로필. 비활성 사용자는 여기서 차단한다 (설계서 §5.2).
// 한 요청 안에서 여러 컴포넌트가 불러도 DB 조회는 한 번 (React cache)
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, login_id, name, role, team_id, is_active, teams(name)")
    .eq("id", auth.user.id)
    .single();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=inactive");
  }

  const team = profile.teams as { name: string } | { name: string }[] | null;
  return {
    id: profile.id,
    loginId: profile.login_id,
    name: profile.name,
    role: profile.role as CurrentUser["role"],
    teamId: profile.team_id,
    teamName: Array.isArray(team) ? (team[0]?.name ?? null) : (team?.name ?? null),
  };
});
