"use client";

// 조회 범위 버튼 — [개인 | 부문] + 부문일 때 영업대표 선택. 주소(?scope=team&owner=)로 바꿔 새로고침·공유해도 유지
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { scopeHref, type ViewScope } from "./scope";

export function ScopeSwitch({
  path,
  scope,
  members,
  meId,
  teamName,
}: {
  path: "/dashboard" | "/pipeline" | "/tasks" | "/reports";
  scope: ViewScope;
  members: { id: string; name: string }[];
  meId: string;
  /** 부문이 없으면(관리자) null — 버튼을 숨긴다 */
  teamName: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!teamName) return null;

  const go = (s: Parameters<typeof scopeHref>[1]) => start(() => router.push(scopeHref(path, s)));
  const team = scope.kind !== "mine";
  const seg = (on: boolean) => `rounded-md px-3 py-1 text-xs transition-colors ${on ? "bg-accent/20 font-medium text-fg ring-1 ring-accent/50" : "text-muted hover:text-fg"}`;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${pending ? "opacity-70" : ""}`} aria-busy={pending}>
      <div role="group" aria-label="조회 범위" className="inline-flex rounded-lg border border-line bg-surface/80 p-0.5 backdrop-blur-sm">
        <button type="button" aria-pressed={!team} onClick={() => go({ kind: "mine" })} className={seg(!team)}>
          개인
        </button>
        <button type="button" aria-pressed={team} onClick={() => go({ kind: "team" })} className={seg(team)}>
          부문
        </button>
      </div>
      {team && (
        <select
          aria-label="영업대표"
          value={scope.kind === "member" ? scope.id : ""}
          onChange={(e) => go(e.target.value ? (e.target.value === meId ? { kind: "mine" } : { kind: "member", id: e.target.value }) : { kind: "team" })}
          className="rounded-lg border border-line bg-surface/80 px-2 py-1 text-xs text-fg"
        >
          <option value="">{teamName} 전체</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.id === meId ? " (나)" : ""}
            </option>
          ))}
        </select>
      )}
      {pending && <span aria-hidden className="h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent" />}
    </div>
  );
}
