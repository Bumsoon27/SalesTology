"use client";

// 상세 패널 '핵심 정보' 수정 폼. 저장은 updateDealInfo (동시 수정 시 덮어쓰지 않음)
import { useState, useTransition } from "react";
import type { DealDetail } from "./detail";
import { updateDealInfo } from "./mutations";

const label = "mb-1 block text-[11px] text-muted";
const comma = (n: number | null) => (n == null ? "" : n.toLocaleString());

export function DealInfoEditor({ d, onDone, onSaved }: { d: DealDetail; onDone: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    name: d.name,
    amount: comma(d.amount),
    gp: comma(d.gp),
    contractType: d.contractType as string,
    periodStart: d.periodStart ?? "",
    periodEnd: d.periodEnd ?? "",
    items: d.items ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const err = (k: string) => errors[k] && <p className="mt-1 text-[11px] text-st-red">{errors[k]}</p>;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateDealInfo(d.id, v, d.updatedAt);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setError(r.fieldErrors ? null : r.error);
        if (r.conflict) onSaved(); // 새 값을 다시 불러온다
        return;
      }
      onSaved();
      onDone();
    });
  };

  return (
    <form onSubmit={save} className={`space-y-3 text-sm ${pending ? "opacity-70" : ""}`}>
      <div>
        <label className={label} htmlFor="ed-name">사업명</label>
        <input id="ed-name" value={v.name} onChange={set("name")} className="field py-1.5 text-sm" />
        {err("name")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="ed-amount">사업 규모 (원)</label>
          <input id="ed-amount" value={v.amount} onChange={set("amount")} inputMode="numeric" className="field py-1.5 text-sm" placeholder="150,000,000" />
          {err("amount")}
        </div>
        <div>
          <label className={label} htmlFor="ed-gp">GP (이윤, 원)</label>
          <input id="ed-gp" value={v.gp} onChange={set("gp")} inputMode="numeric" className="field py-1.5 text-sm" placeholder="15,000,000" />
          {err("gp")}
        </div>
        <div>
          <label className={label} htmlFor="ed-ct">계약 방식</label>
          <select id="ed-ct" value={v.contractType} onChange={set("contractType")} className="field py-1.5 text-sm">
            <option value="competitive">경쟁입찰</option>
            <option value="negotiated">수의계약</option>
          </select>
          {err("contractType")}
        </div>
        <div>
          <label className={label} htmlFor="ed-items">물품 요약</label>
          <input id="ed-items" value={v.items} onChange={set("items")} className="field py-1.5 text-sm" />
        </div>
        <div>
          <label className={label} htmlFor="ed-ps">계약 기간 시작</label>
          <input id="ed-ps" type="date" value={v.periodStart} onChange={set("periodStart")} className="field py-1.5 text-sm" />
          {err("periodStart")}
        </div>
        <div>
          <label className={label} htmlFor="ed-pe">계약 기간 종료</label>
          <input id="ed-pe" type="date" value={v.periodEnd} onChange={set("periodEnd")} className="field py-1.5 text-sm" />
          {err("periodEnd")}
        </div>
      </div>
      {error && <p className="text-xs text-st-red">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-md border border-line px-3 py-1 text-xs text-muted">
          취소
        </button>
        <button type="submit" disabled={pending} className="rounded-md bg-fg px-3 py-1 text-xs font-semibold text-bg disabled:opacity-50">
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
