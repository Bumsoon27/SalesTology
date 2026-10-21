"use client";

import { useState, useTransition } from "react";
import { restoreItem, setJoinCode, setUserActive, type AdminResult } from "./actions";
import type { AdminTeam, AdminUser, DeletedItem } from "./queries";

const card = "rounded-2xl border border-line bg-surface/70";
const mini = "rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:border-accent/40 hover:text-fg disabled:opacity-40";

function useAct() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<AdminResult>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "실패했습니다."));
    });
  return { pending, error, act };
}

export function TeamsPanel({ teams }: { teams: AdminTeam[] }) {
  const { pending, error, act } = useAct();
  const [editing, setEditing] = useState<string | null>(null);
  const [code, setCode] = useState("");
  return (
    <section className={card}>
      <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">부문 · 가입 코드</h2>
      {error && <p className="px-5 pt-3 text-xs text-st-red">{error}</p>}
      <ul className={pending ? "opacity-60" : ""}>
        {teams.map((t) => (
          <li key={t.id} className="flex items-center gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
            <span className="flex-1">{t.name}</span>
            <span className="text-xs text-muted">{t.memberCount}명</span>
            {editing === t.id ? (
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(() => setJoinCode(t.id, code));
                  setEditing(null);
                }}
              >
                <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} className="field w-28 py-1 text-xs tracking-widest" />
                <button className={mini}>저장</button>
                <button type="button" className={mini} onClick={() => setEditing(null)}>취소</button>
              </form>
            ) : (
              <>
                <code className="rounded bg-white/5 px-2 py-0.5 text-xs tracking-widest">{t.joinCode}</code>
                <button
                  className={mini}
                  onClick={() => {
                    setEditing(t.id);
                    setCode(t.joinCode);
                  }}
                >
                  변경
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UsersPanel({ users, meId }: { users: AdminUser[]; meId: string }) {
  const { pending, error, act } = useAct();
  return (
    <section className={card}>
      <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">사용자 {users.length}</h2>
      {error && <p className="px-5 pt-3 text-xs text-st-red">{error}</p>}
      <ul className={pending ? "opacity-60" : ""}>
        {users.map((u) => (
          <li key={u.id} className={`flex items-center gap-3 border-b border-line px-5 py-3 text-sm last:border-0 ${u.isActive ? "" : "opacity-50"}`}>
            <span className="flex-1">
              {u.name} <span className="text-xs text-muted">· {u.loginId}</span>
            </span>
            <span className="text-xs text-muted">{u.teamName ?? "부문 없음"}</span>
            {u.role === "admin" && <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] text-accent">관리자</span>}
            <button
              className={mini}
              disabled={u.id === meId}
              title={u.id === meId ? "본인 계정은 비활성화할 수 없습니다" : undefined}
              onClick={() => act(() => setUserActive(u.id, !u.isActive))}
            >
              {u.isActive ? "비활성화" : "다시 활성화"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DeletedPanel({ items }: { items: DeletedItem[] }) {
  const { pending, error, act } = useAct();
  return (
    <section className={card}>
      <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">삭제된 항목 복구</h2>
      {error && <p className="px-5 pt-3 text-xs text-st-red">{error}</p>}
      {items.length === 0 ? (
        <p className="px-5 py-4 text-xs text-muted">삭제된 사업·회사가 없습니다.</p>
      ) : (
        <ul className={pending ? "opacity-60" : ""}>
          {items.map((i) => (
            <li key={`${i.kind}-${i.id}`} className="flex items-center gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
              <span className="w-12 text-[11px] text-muted">{i.kind === "deal" ? "사업" : "회사"}</span>
              <span className="flex-1 truncate">
                {i.name}
                {i.extra && <span className="text-xs text-muted"> · {i.extra}</span>}
              </span>
              <span className="text-xs text-muted">{new Date(i.deletedAt).toLocaleDateString("ko-KR")}</span>
              <button className={mini} onClick={() => act(() => restoreItem(i.kind, i.id))}>복구</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
