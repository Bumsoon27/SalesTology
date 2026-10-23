"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { touchArea } from "./sos-styles";

// 좁은 화면(≤767px)에서 필터를 아래에서 올라오는 시트로 연다 (시각 설계서 §6). 넓은 화면은 그 자리에 가로 줄로 둔다.
// 안의 폼은 그대로 주소(GET) 폼이다 — 제출하면 시트를 닫는다.
const NARROW = "(max-width: 767px)";

export function FilterSheet({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // 열면 첫 칸으로 초점을 옮기고, 닫으면 [필터] 버튼으로 돌려준다
    sheet.current?.querySelector<HTMLElement>("select, input, button")?.focus();
    const btn = opener.current;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // 창을 넓히면 시트 모양이 아니므로 닫는다
    const mq = window.matchMedia(NARROW);
    const onWide = () => !mq.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
      btn?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
        className={`${touchArea} h-10 rounded-[4px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] px-3 text-sm text-[var(--sos-text)] min-[768px]:hidden`}
      >
        필터{count > 0 && <span className="sos-num ml-1 text-[var(--sos-accent)]">{count}</span>}
      </button>
      {open && <div aria-hidden className="fixed inset-0 z-40 bg-black/60 min-[768px]:hidden" onClick={() => setOpen(false)} />}
      <div
        ref={sheet}
        id={id}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "필터" : undefined}
        onSubmit={() => setOpen(false)}
        className={`${
          open
            ? "fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col gap-4 overflow-y-auto rounded-t-[6px] bg-[var(--sos-bg-modal)] px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_0_16px_rgba(0,0,0,0.2)]"
            : "hidden"
        } min-[768px]:static min-[768px]:z-auto min-[768px]:flex min-[768px]:max-h-none min-[768px]:overflow-visible min-[768px]:rounded-none min-[768px]:bg-transparent min-[768px]:p-0 min-[768px]:shadow-none`}
      >
        {open && (
          <div className="flex items-center justify-between min-[768px]:hidden">
            <p className="text-base font-semibold text-[var(--sos-text-strong)]">필터</p>
            <button type="button" onClick={() => setOpen(false)} className={`${touchArea} text-sm text-[var(--sos-text-sub)] hover:text-[var(--sos-accent)]`}>
              닫기 ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
