"use client";

// 월 목표 입력 (리포트 화면) — 부문 목표 또는 내 개인 목표, 올해 12개월. 3억·5000만·50,000,000 모두 받는다
import { useState, useTransition } from "react";
import { saveTargets } from "./actions";

export function TargetEditor({
  ownerId,
  year,
  initial,
  label,
}: {
  ownerId: string | null;
  year: number;
  /** month(YYYY-MM-01) → 금액(원) */
  initial: Record<string, number>;
  label: string;
}) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(months.map((m) => [m, initial[m] != null ? initial[m].toLocaleString() : ""])),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const filled = Object.keys(initial).length;

  return (
    <section className="rounded-2xl border border-line bg-surface/60">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold">
          {label} 목표 <span className="text-xs font-normal text-muted">· {year}년 {filled ? `${filled}개월 입력됨` : "아직 없음"}</span>
        </span>
        <span className={`text-xs text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <form
          className={`animate-[fadeIn_.18s_ease-out] space-y-3 border-t border-line px-4 py-3 ${pending ? "opacity-60" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveTargets(ownerId, months.map((m) => ({ month: m, amount: values[m] ?? "" })));
              setMsg(r.ok ? { ok: true, text: "저장했습니다." } : { ok: false, text: r.error });
            });
          }}
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {months.map((m, i) => (
              <label key={m} className="text-[11px] text-muted">
                {i + 1}월
                <input
                  inputMode="numeric"
                  value={values[m]}
                  onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
                  placeholder="예: 3억"
                  className="field mt-1 py-1 text-right text-xs"
                  aria-label={`${i + 1}월 목표`}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted">분기·연간 목표는 월 목표를 더해 계산합니다 · 비우면 그 달 목표를 지웁니다</p>
            <div className="flex items-center gap-2">
              {msg && <span className={`text-[11px] ${msg.ok ? "text-st-green" : "text-st-red"}`}>{msg.text}</span>}
              <button type="submit" disabled={pending} className="rounded-md bg-fg px-3 py-1 text-xs font-semibold text-bg disabled:opacity-40">
                저장
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
