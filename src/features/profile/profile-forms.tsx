"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeMyPassword, updateMyName, type ProfileState } from "./actions";

const label = "mb-1.5 block text-xs text-muted";
const card = "space-y-4 rounded-2xl border border-line bg-surface/70 p-6";

function Result({ state }: { state: ProfileState }) {
  if (state.error) return <p className="text-sm text-st-red">{state.error}</p>;
  if (state.ok && state.message) return <p className="text-sm text-st-green">{state.message}</p>;
  return null;
}

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateMyName, { ok: false });
  return (
    <form action={action} className={card}>
      <h2 className="text-sm font-semibold">실명</h2>
      <p className="text-xs text-muted">SalesTology 대시보드의 중심과 사업의 영업대표로 표시됩니다.</p>
      <input name="name" defaultValue={name} className="field" required minLength={2} maxLength={30} />
      <Result state={state} />
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ProfileState, FormData>(changeMyPassword, { ok: false });
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className={card}>
      <h2 className="text-sm font-semibold">비밀번호 변경</h2>
      <div>
        <label className={label} htmlFor="pw-cur">현재 비밀번호</label>
        <input id="pw-cur" name="current" type="password" autoComplete="current-password" className="field" required />
      </div>
      <div>
        <label className={label} htmlFor="pw-new">새 비밀번호 (8자 이상, 영문·숫자·특수문자)</label>
        <input id="pw-new" name="next" type="password" autoComplete="new-password" className="field" required />
      </div>
      <div>
        <label className={label} htmlFor="pw-conf">새 비밀번호 확인</label>
        <input id="pw-conf" name="confirm" type="password" autoComplete="new-password" className="field" required />
      </div>
      <Result state={state} />
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
