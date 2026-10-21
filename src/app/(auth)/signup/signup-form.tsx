"use client";

import { useActionState } from "react";
import { signupStep, type SignupState } from "./actions";

const label = "mb-1.5 block text-xs text-muted";

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signupStep, { step: "code" });
  const err = (k: keyof NonNullable<SignupState["fieldErrors"]>) =>
    state.fieldErrors?.[k] && <p className="mt-1 text-xs text-st-red">{state.fieldErrors[k]}</p>;

  if (state.step === "code") {
    return (
      <form action={action} className="space-y-5">
        <div>
          <label className={label} htmlFor="su-code">부문 코드</label>
          <input id="su-code" name="code" inputMode="numeric" autoComplete="off" className="field tracking-[0.3em]" placeholder="관리자에게 받은 코드" required />
          {err("code")}
        </div>
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "확인 중…" : "다음"}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-center text-sm">
        <span className="font-semibold">{state.teamName}</span>으로 가입합니다
      </p>
      <div>
        <label className={label} htmlFor="su-id">ID (영문 소문자·숫자 4~20자)</label>
        <input id="su-id" name="loginId" autoComplete="username" className="field" required />
        {err("loginId")}
      </div>
      <div>
        <label className={label} htmlFor="su-name">이름 (실명)</label>
        <input id="su-name" name="name" autoComplete="name" className="field" required />
        {err("name")}
      </div>
      <div>
        <label className={label} htmlFor="su-pw">비밀번호 (8자 이상, 영문·숫자·특수문자)</label>
        <input id="su-pw" name="password" type="password" autoComplete="new-password" className="field" required />
        {err("password")}
      </div>
      <div>
        <label className={label} htmlFor="su-pw2">비밀번호 확인</label>
        <input id="su-pw2" name="confirm" type="password" autoComplete="new-password" className="field" required />
        {err("confirm")}
      </div>
      {state.error && <p className="text-sm text-st-red">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "만드는 중…" : "가입하고 시작하기"}
      </button>
      <button type="submit" name="back" value="1" formNoValidate className="w-full text-center text-xs text-muted hover:text-fg">
        ← 부문 코드 다시 입력
      </button>
    </form>
  );
}
