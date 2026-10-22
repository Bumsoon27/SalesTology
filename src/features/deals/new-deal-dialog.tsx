"use client";

// [+ 새 영업기회] — 5분 안에 입력할 수 있는 최소 필드 (설계서 §6.6)
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createDeal, type CreateDealState } from "./actions";
import { STAGE_LABEL, type DealStage } from "./types";
import { PartnerPicker } from "@/features/partners/partner-picker";

export type PartnerOption = { name: string; roles: ("customer" | "si" | "supplier")[] };

const STAGES = Object.entries(STAGE_LABEL) as [DealStage, string][];
const norm = (s: string) => s.replace(/\s|\(주\)|주식회사|㈜/g, "").toLowerCase();

export function NewDealDialog({
  companyNames,
  partners,
  autoOpen = false,
}: {
  companyNames: string[];
  partners: PartnerOption[];
  autoOpen?: boolean;
}) {
  const customerOptions = partners.filter((p) => p.roles.includes("customer")).map((p) => p.name);
  const siOptions = partners.filter((p) => p.roles.includes("si")).map((p) => p.name);
  const supplierOptions = partners.filter((p) => p.roles.includes("supplier")).map((p) => p.name);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<CreateDealState, FormData>(createDeal, { ok: false });
  const [customer, setCustomer] = useState("");
  const [contractType, setContractType] = useState("negotiated");

  // 비슷한 회사명이 이미 있으면 중복 경고
  const similar = useMemo(() => {
    const n = norm(customer);
    if (n.length < 2 || companyNames.includes(customer.trim())) return null;
    return companyNames.find((c) => norm(c).includes(n) || n.includes(norm(c))) ?? null;
  }, [customer, companyNames]);

  useEffect(() => {
    if (autoOpen) dialogRef.current?.showModal();
  }, [autoOpen]);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      dialogRef.current?.close();
    }
  }, [state]);

  const err = (k: string) => state.fieldErrors?.[k] && <p className="mt-1 text-xs text-st-red">{state.fieldErrors[k]}</p>;
  const label = "mb-1.5 block text-xs text-muted";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCustomer("");
          dialogRef.current?.showModal();
        }}
        className="min-w-[7.5rem] rounded-lg bg-fg px-3 py-1.5 text-center text-xs font-semibold text-bg shadow-[0_0_24px_rgba(154,171,255,0.35)] transition-opacity hover:opacity-90"
      >
        + 새 영업기회
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(640px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <form ref={formRef} action={action} className="max-h-[85vh] space-y-5 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">새 영업기회</h2>
            <button type="button" onClick={() => dialogRef.current?.close()} className="text-muted hover:text-fg" aria-label="닫기">
              ✕
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="nd-name">사업명 *</label>
              <input id="nd-name" name="name" className="field" placeholder="예: 차세대 서버 구축" required />
              {err("name")}
            </div>
            <div>
              <label className={label} htmlFor="nd-customer">고객사 *</label>
              <input
                id="nd-customer"
                name="customer"
                list="nd-companies"
                className="field"
                placeholder="없으면 새로 만들어집니다"
                onChange={(e) => setCustomer(e.target.value)}
                required
              />
              {customerOptions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customerOptions.slice(0, 12).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        const el = document.getElementById("nd-customer") as HTMLInputElement | null;
                        if (el) el.value = c;
                        setCustomer(c);
                      }}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] ${customer === c ? "border-accent/60 bg-accent/15 text-fg" : "border-line text-muted hover:text-fg"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              {similar && <p className="mt-1 text-xs text-st-yellow">비슷한 회사가 있습니다: {similar}</p>}
              {err("customer")}
            </div>
            <div>
              <span className={label}>계약 방식 *</span>
              <div className="flex gap-2">
                {[
                  ["negotiated", "수의계약"],
                  ["competitive", "경쟁입찰"],
                ].map(([v, l]) => (
                  <label
                    key={v}
                    className={`flex-1 cursor-pointer rounded-[10px] border px-3 py-2.5 text-center text-sm ${
                      contractType === v ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-muted"
                    }`}
                  >
                    <input type="radio" name="contractType" value={v} checked={contractType === v} onChange={() => setContractType(v)} className="sr-only" />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <span className={label}>매출처(SI) — 등록된 파트너에서 선택 (없으면 비워두기)</span>
              <PartnerPicker name="si" options={siOptions} placeholder="목록에 없는 SI 이름 입력 후 Enter" />
            </div>
            <div className="sm:col-span-2">
              <span className={label}>매입처 — 등록된 파트너에서 선택</span>
              <PartnerPicker name="suppliers" options={supplierOptions} placeholder="목록에 없는 매입처 이름 입력 후 Enter" />
            </div>
            <div>
              <label className={label} htmlFor="nd-amount">사업 규모 (원, 부가세 별도)</label>
              <input id="nd-amount" name="amount" inputMode="numeric" className="field" placeholder="예: 150000000" />
              {err("amount")}
            </div>
            <div>
              <label className={label} htmlFor="nd-gp">GP (이윤, 원)</label>
              <input id="nd-gp" name="gp" inputMode="numeric" className="field" placeholder="예: 15000000" />
              {err("gp")}
            </div>
            <div>
              <label className={label} htmlFor="nd-stage">단계</label>
              <select id="nd-stage" name="stage" className="field" defaultValue="discovery">
                {STAGES.filter(([s]) => s !== "bidding" || contractType === "competitive").map(([s, l]) => (
                  <option key={s} value={s}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="nd-items">물품 요약</label>
              <input id="nd-items" name="items" className="field" placeholder="예: x86 서버 10식" />
            </div>
            <div>
              <label className={label} htmlFor="nd-ps">계약 기간 시작</label>
              <input id="nd-ps" name="periodStart" type="date" className="field" />
            </div>
            <div>
              <label className={label} htmlFor="nd-pe">계약 기간 종료</label>
              <input id="nd-pe" name="periodEnd" type="date" className="field" />
              {err("periodEnd")}
            </div>
          </div>

          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-xs text-muted">빠른 일정 — 날짜를 넣으면 추적 업무가 자동으로 만들어집니다</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["deliveryDate", "배송일"],
                ["invoiceDate", "계산서 발행일"],
              ].map(([n, l]) => (
                <div key={n}>
                  <label className={label} htmlFor={`nd-${n}`}>{l}</label>
                  <input id={`nd-${n}`} name={n} type="date" className="field" />
                </div>
              ))}
            </div>
          </fieldset>

          {state.error && <p className="text-sm text-st-red">저장하지 못했습니다: {state.error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-[10px] border border-line px-4 py-2 text-sm text-muted">
              취소
            </button>
            <button type="submit" disabled={pending} className="rounded-[10px] bg-fg px-5 py-2 text-sm font-semibold text-bg disabled:opacity-50">
              {pending ? "저장 중…" : "등록"}
            </button>
          </div>
          <datalist id="nd-companies">
            {companyNames.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </form>
      </dialog>
    </>
  );
}
