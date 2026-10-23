"use client";

// 상세 패널 '관계사' — 고객사·SI·매입처 보기와 수정
import { useId, useState, useTransition } from "react";
import type { DealDetail } from "./detail";
import { addDealParty, listCompanyOptions, removeDealParty, setDealCustomer, type MutationResult } from "./mutations";

const mini = "rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-fg";
const ROLE_LABEL = { si: "SI", supplier: "매입" } as const;

export function DealPartiesSection({ d, onChanged }: { d: DealDetail; onChanged: () => void }) {
  const listId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId === d.id;
  const [options, setOptions] = useState<{ name: string; roles: string[] }[] | null>(null);
  const [customer, setCustomer] = useState("");
  const [draft, setDraft] = useState({ si: "", supplier: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const si = d.parties.filter((p) => p.role === "si");
  const sup = d.parties.filter((p) => p.role === "supplier");

  const startEdit = () => {
    setEditingId(d.id);
    setCustomer(d.customer.name);
    setError(null);
    if (!options) void listCompanyOptions().then(setOptions);
  };

  const run = (fn: () => Promise<MutationResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        if (r.conflict) onChanged();
        return;
      }
      setError(null);
      after?.();
      onChanged();
    });

  const add = (role: "si" | "supplier") => {
    const name = draft[role].trim();
    if (!name) return;
    run(() => addDealParty(d.id, name, role), () => setDraft((v) => ({ ...v, [role]: "" })));
  };

  const header = (
    <div className="flex items-center justify-between">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">관계사</h3>
      {editing ? (
        <button type="button" className={mini} onClick={() => setEditingId(null)}>
          완료
        </button>
      ) : (
        <button type="button" className={mini} onClick={startEdit}>
          수정
        </button>
      )}
    </div>
  );

  if (!editing) {
    return (
      <section className="space-y-2.5 border-t border-line px-5 py-4">
        {header}
        <p className="text-sm">
          <span className="text-[11px] text-muted">고객사 </span>
          {d.customer.name}
        </p>
        {d.parties.length === 0 ? (
          <p className="text-xs text-muted">SI·매입처 없이 직접 진행</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {[...si, ...sup].map((p) => (
              <span key={p.id} className="rounded-full border border-line px-2.5 py-1 text-xs">
                {p.company.name} <span className="text-muted">· {ROLE_LABEL[p.role]}</span>
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }

  const group = (role: "si" | "supplier", title: string, rows: typeof si) => (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted">{title}</p>
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((p) => (
            <span key={p.id} className="flex items-center gap-1 rounded-full border border-line py-1 pl-2.5 pr-1 text-xs">
              {p.company.name}
              <button
                type="button"
                aria-label={`${p.company.name} 빼기`}
                onClick={() => run(() => removeDealParty(p.id))}
                className="rounded-full px-1 text-muted hover:bg-white/10 hover:text-st-red"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add(role);
        }}
      >
        <input
          list={`${listId}-${role}`}
          value={draft[role]}
          onChange={(e) => setDraft((v) => ({ ...v, [role]: e.target.value }))}
          placeholder={`${title} 추가 (등록된 파트너에서 고르거나 새 이름)`}
          className="field py-1.5 text-xs"
        />
        <button type="submit" className={mini}>
          추가
        </button>
      </form>
      <datalist id={`${listId}-${role}`}>
        {(options ?? [])
          .filter((o) => o.roles.includes(role))
          .map((o) => (
            <option key={o.name} value={o.name} />
          ))}
      </datalist>
    </div>
  );

  return (
    <section className={`space-y-3 border-t border-line px-5 py-4 ${pending ? "opacity-70" : ""}`}>
      {header}
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (customer.trim() && customer.trim() !== d.customer.name) run(() => setDealCustomer(d.id, customer, d.updatedAt));
        }}
      >
        <label className="block text-[11px] text-muted" htmlFor={`${listId}-customer`}>
          고객사
        </label>
        <div className="flex gap-1.5">
          <input id={`${listId}-customer`} list={`${listId}-customers`} value={customer} onChange={(e) => setCustomer(e.target.value)} className="field py-1.5 text-xs" />
          <button type="submit" className={mini} disabled={!customer.trim() || customer.trim() === d.customer.name}>
            변경
          </button>
        </div>
        <datalist id={`${listId}-customers`}>
          {(options ?? []).map((o) => (
            <option key={o.name} value={o.name} />
          ))}
        </datalist>
      </form>
      {group("si", "매출처(SI)", si)}
      {group("supplier", "매입처", sup)}
      {error && <p className="text-xs text-st-red">{error}</p>}
    </section>
  );
}
