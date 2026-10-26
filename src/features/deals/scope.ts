// 조회 범위 (대시보드·파이프라인): 개인(기본) | 부문 전체 | 부문의 특정 영업대표. 순수 함수 (테스트: scope.test.ts)
// 주소: ?scope=team  ·  ?scope=team&owner=<사용자 id>
// 요청값은 믿지 않는다 — 부문이 없으면(관리자) 개인, owner 는 부문 활성 구성원일 때만 받는다.

export type ViewScope = { kind: "mine" } | { kind: "team" } | { kind: "member"; id: string; name: string };

export function resolveScope(
  params: { scope?: string | string[]; owner?: string | string[] },
  user: { id: string; teamId: string | null },
  members: { id: string; name: string }[],
): ViewScope {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  if (!user.teamId || one(params.scope) !== "team") return { kind: "mine" };
  const owner = one(params.owner);
  if (!owner) return { kind: "team" };
  if (owner === user.id) return { kind: "mine" };
  const m = members.find((x) => x.id === owner);
  return m ? { kind: "member", id: m.id, name: m.name } : { kind: "team" };
}

/** 범위 → 주소 (같은 페이지에서 쿼리만 바꾼다) */
export function scopeHref(path: string, s: { kind: "mine" } | { kind: "team" } | { kind: "member"; id: string }): string {
  if (s.kind === "mine") return path;
  if (s.kind === "team") return `${path}?scope=team`;
  return `${path}?scope=team&owner=${encodeURIComponent(s.id)}`;
}
