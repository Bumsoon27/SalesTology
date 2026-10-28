"use client";

// 상세 패널 '관계사' — 고객사·SI·매입처 보기와 수정
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import type { DealDetail } from "./detail";
import { addDealParty, listCompanyOptions, removeDealParty, setDealCustomer, type MutationResult } from "./mutations";

const mini = "rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-fg";

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
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">고객사 · 매출처 · 매입처</h3>
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
        <dl className="space-y-2 text-sm">
          {(
            [
              ["고객사", [d.customer]],
              ["매출처(SI)", si.map((p) => p.company)],
              ["매입처", sup.map((p) => p.company)],
            ] as [string, { id: string; name: string }[]][]
          ).map(([k, names]) => (
            <div key={k} className="grid grid-cols-[4.5rem_1fr] items-start gap-2">
              <dt className="pt-0.5 text-[11px] text-muted">{k}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {names.length === 0 ? (
                  <span className="text-xs text-muted">없음 (직접 진행)</span>
                ) : (
                  names.map((c) => (
                    // 회사 이름 → 고객사 상세 (걸린 사업·실적·활동)
                    <Link key={c.id} href={`/partners/${c.id}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs hover:border-accent/50 hover:text-accent" title="회사 상세 보기">
                      {c.name}
                    </Link>
                  ))
                )}
              </dd>
            </div>
          ))}
        </dl>
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
