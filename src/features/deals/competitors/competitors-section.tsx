"use client";

// 상세 패널 '경쟁사' — 경쟁사·제안가·낙찰 여부. 경쟁입찰 사업이면 펼쳐서 보여준다
import { useCallback, useEffect, useState, useTransition } from "react";
import { addCompetitor, deleteCompetitor, listCompetitors, type Competitor } from "./actions";
import { COMPETITOR_NAME_MAX, COMPETITOR_NOTE_MAX } from "./competitors";
import { formatEok as eok } from "@/features/deals/money";

const mini = "rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-fg disabled:opacity-40";

export function CompetitorsSection({ dealId, competitive }: { dealId: string; competitive: boolean }) {
  const [items, setItems] = useState<Competitor[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", bid: "", isWinner: false, note: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const r = await listCompetitors(dealId);
    if (!r.ok) return setError(r.error);
    setItems(r.items);
  }, [dealId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const submit = () =>
    start(async () => {
      const r = await addCompetitor(dealId, form);
      if (!r.ok) return setError(r.error);
      setError(null);
      setForm({ name: "", bid: "", isWinner: false, note: "" });
      setAdding(false);
      await load();
    });

  const remove = (c: Competitor) =>
    start(async () => {
      const r = await deleteCompetitor(c.id);
      if (!r.ok) return setError(r.error);
      await load();
    });

  // 수의계약이고 기록이 없으면 한 줄로만
  if (!competitive && items?.length === 0 && !adding) {
    return (
      <section className="flex items-center justify-between border-t border-line px-5 py-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">경쟁사 없음</h3>
        <button type="button" className={mini} onClick={() => setAdding(true)}>
          + 경쟁사
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-2.5 border-t border-line px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">경쟁사 {items?.length ?? ""}</h3>
        {!adding && (
          <button type="button" className={mini} onClick={() => setAdding(true)}>
            + 경쟁사
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-st-red">{error}</p>}
      {adding && (
        <form
          className="space-y-2 rounded-xl border border-line bg-white/[0.03] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <input className="field py-1 text-xs" placeholder="경쟁사 (예: LG CNS)" maxLength={COMPETITOR_NAME_MAX} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="경쟁사 이름" required />
            <input className="field py-1 text-right text-xs" inputMode="numeric" placeholder="제안가 (선택, 예: 3억)" value={form.bid} onChange={(e) => setForm({ ...form, bid: e.target.value })} aria-label="경쟁사 제안가" />
          </div>
          <input className="field py-1 text-xs" placeholder="메모 (선택 — 강점·가격 전략 등)" maxLength={COMPETITOR_NOTE_MAX} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="경쟁사 메모" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <input type="checkbox" checked={form.isWinner} onChange={(e) => setForm({ ...form, isWinner: e.target.checked })} />
              이 경쟁사가 낙찰 (실주 시)
            </label>
            <span className="flex gap-1.5">
              <button type="button" className={mini} onClick={() => setAdding(false)}>
                취소
              </button>
              <button type="submit" disabled={pending} className="rounded-md bg-fg px-2.5 py-0.5 text-[11px] font-semibold text-bg disabled:opacity-40">
                기록
              </button>
            </span>
          </div>
        </form>
      )}
      {items == null ? (
        <p className="text-xs text-muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        !adding && <p className="text-xs text-muted">맞붙는 경쟁사를 기록해 두면 리포트에서 경쟁사별 전적을 볼 수 있습니다.</p>
      ) : (
        <ul className={`space-y-1.5 ${pending ? "opacity-60" : ""}`}>
          {items.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {c.name}
                  {c.isWinner && <span className="ml-1.5 rounded-full border border-st-red/50 px-1.5 text-[10px] text-st-red">낙찰</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted tabular-nums">
                  {c.bid != null && eok(c.bid)}
                  {c.mine && (
                    <button type="button" className={mini} onClick={() => remove(c)} aria-label={`${c.name} 지우기`}>
                      ✕
                    </button>
                  )}
                </span>
              </div>
              {c.note && <p className="text-[11px] text-muted">{c.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
