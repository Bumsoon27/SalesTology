"use client";

import { useActionState, useEffect, useRef } from "react";
import { registerPartner, type RegisterPartnerState } from "./actions";

export function PartnerForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<RegisterPartnerState, FormData>(registerPartner, { ok: false });

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const label = "mb-1.5 block text-xs text-muted";
  return (
    <form ref={formRef} action={action} className="space-y-4 rounded-2xl border border-line bg-surface/70 p-5">
      <h2 className="text-sm font-semibold">파트너사 등록</h2>
      <div>
        <label className={label} htmlFor="pf-name">회사명 *</label>
        <input id="pf-name" name="name" className="field" placeholder="예: 가람정보" required />
      </div>
      <div>
        <span className={label}>역할 * (둘 다 가능)</span>
        <div className="flex gap-2">
          {[
            ["si", "SI 업체"],
            ["supplier", "매입처"],
          ].map(([v, l]) => (
            <label key={v} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-line px-3 py-2.5 text-sm text-muted has-[:checked]:border-accent/60 has-[:checked]:bg-accent/10 has-[:checked]:text-fg">
              <input type="checkbox" name="roles" value={v} className="sr-only" defaultChecked={v === "si"} />
              {l}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="pf-cn">담당자</label>
          <input id="pf-cn" name="contactName" className="field" />
        </div>
        <div>
          <label className={label} htmlFor="pf-ci">연락처</label>
          <input id="pf-ci" name="contactInfo" className="field" placeholder="전화 또는 이메일" />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="pf-memo">메모</label>
        <input id="pf-memo" name="memo" className="field" placeholder="주력 품목, 특이사항 등" />
      </div>
      {state.error && <p className="text-sm text-st-red">{state.error}</p>}
      {state.ok && <p className="text-sm text-st-green">‘{state.savedName}’ 등록 완료</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "저장 중…" : "등록"}
      </button>
    </form>
  );
}
