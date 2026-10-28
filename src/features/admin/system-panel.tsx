"use client";

// 관리자 '시스템 상태' — DB 자동 반영·토큰 만료·연결 설정. 값(비밀)은 보이지 않고 상태만
import { useState, useTransition } from "react";
import { saveTokenExpiry } from "./actions";
import type { Check, CheckState } from "./system-status";

const TONE: Record<CheckState, { dot: string; label: string }> = {
  ok: { dot: "bg-st-green", label: "정상" },
  warn: { dot: "bg-st-yellow", label: "확인" },
  error: { dot: "bg-st-red", label: "오류" },
  off: { dot: "bg-st-grey", label: "꺼짐" },
};

export function SystemPanel({ checks, tokenExpiresOn, commit }: { checks: Check[]; tokenExpiresOn: string | null; commit: string | null }) {
  const [date, setDate] = useState(tokenExpiresOn ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const bad = checks.filter((c) => c.state === "error").length;

  return (
    <section className="rounded-2xl border border-line bg-surface/70">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold">시스템 상태</h2>
        <span className={`text-[11px] ${bad ? "text-st-red" : "text-st-green"}`}>{bad ? `오류 ${bad}` : "모두 정상"}</span>
      </div>
      <ul>
        {checks.map((c) => (
          <li key={c.id} className="flex gap-3 border-b border-line px-5 py-2.5 text-xs last:border-0">
            <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TONE[c.state].dot}`} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {c.label} <span className="text-[10px] font-normal text-muted">· {TONE[c.state].label}</span>
              </p>
              <p className="mt-0.5 leading-snug text-muted">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <form
        className={`flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-xs ${pending ? "opacity-60" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveTokenExpiry(date);
            setMsg(r.ok ? { ok: true, text: "저장했습니다." } : { ok: false, text: r.error ?? "저장하지 못했습니다." });
          });
        }}
      >
        <label htmlFor="token-exp" className="text-muted">
          Supabase 토큰 만료일
        </label>
        <input id="token-exp" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field w-auto py-1 text-xs" />
        <button type="submit" disabled={pending} className="rounded-md bg-fg px-3 py-1 text-xs font-semibold text-bg disabled:opacity-40">
          저장
        </button>
        {msg && <span className={msg.ok ? "text-st-green" : "text-st-red"}>{msg.text}</span>}
        <p className="w-full text-[10px] text-muted">
          supabase.com → Access Tokens 의 만료일을 적어 두면 14일 전부터 여기와 상단 알림으로 알려 드립니다.
          {commit && ` · 배포 ${commit}`}
        </p>
      </form>
    </section>
  );
}
