type SosUser = { role: "admin" | "member"; teamId: string | null };

export type TeamResolution =
  | { ok: true; teamId: string; isAdminView: boolean }
  | { ok: false; error: string };

/** 부문 결정 — 요청값을 믿지 않는다. member 는 자기 부문 고정, admin 은 존재하는 부문만 */
export function resolveSosTeam(
  user: SosUser,
  requested: string | null,
  existingTeamIds: string[],
): TeamResolution {
  if (user.role === "member") {
    if (!user.teamId) return { ok: false, error: "소속 부문이 없습니다." };
    return { ok: true, teamId: user.teamId, isAdminView: false };
  }
  if (requested === null) {
    if (user.teamId) return { ok: true, teamId: user.teamId, isAdminView: false };
    return { ok: false, error: "부문을 선택해 주세요." };
  }
  if (!existingTeamIds.includes(requested)) return { ok: false, error: "존재하지 않는 부문입니다." };
  return { ok: true, teamId: requested, isAdminView: true };
}
