import "server-only";

import { requireUser } from "@/shared/auth/current-user";
import { requireSosTeam } from "./context";
import { SosDbError } from "./db";
import { getTeams, SosNotReadyError, type TeamOption } from "./queries";

// 설정·실행 기록 화면의 부문 결정 (목록 화면 loadPage 와 같은 규칙). 부문은 requireSosTeam 으로만 정한다.
export type PageTeam =
  | { kind: "notice"; text: string; teams: TeamOption[]; isAdmin: boolean }
  | { kind: "ok"; teamId: string; runTeam: string | null; teams: TeamOption[]; isAdmin: boolean };

export async function resolvePageTeam(requested: string | null): Promise<PageTeam> {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  // requireSosTeam 은 실패하면 /sos?error=team 으로 돌려보낸다 — 그 전에 안내로 막는다
  if (!isAdmin && !user.teamId) return { kind: "notice", text: "소속 부문이 없어 SOS를 쓸 수 없습니다. 관리자에게 문의해 주세요.", teams: [], isAdmin };
  const teams = isAdmin ? await getTeams() : [];
  if (isAdmin && !requested && !user.teamId) return { kind: "notice", text: "볼 부문을 골라 주세요.", teams, isAdmin };
  // member 는 요청값과 무관하게 자기 부문 (Review Focus 4)
  const { teamId, isAdminView } = await requireSosTeam(requested);
  return { kind: "ok", teamId, runTeam: isAdminView ? teamId : null, teams, isAdmin };
}

/** 주소의 ?team= 값 (문자열 하나만) */
export function teamParam(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** 화면 조회를 감싼다 — DB 준비 전·조회 실패는 안내 문구로, redirect·notFound 등은 Next 가 처리하도록 그대로 던진다 */
export async function loadOrNotice<T>(load: () => Promise<T>, failText: string): Promise<{ ok: true; value: T } | { ok: false; text: string }> {
  try {
    return { ok: true, value: await load() };
  } catch (e) {
    if (e instanceof SosNotReadyError) return { ok: false, text: "SOS 데이터베이스가 아직 준비되지 않았습니다" };
    if (e instanceof SosDbError) return { ok: false, text: failText };
    throw e;
  }
}
