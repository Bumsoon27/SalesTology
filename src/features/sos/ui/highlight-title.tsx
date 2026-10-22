"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { highlightRanges } from "../analysis/keywords";
import { addKeywordFromSelection } from "../server/lead-actions";
import type { Tier } from "../types";
import { Toast, type ToastMessage } from "./toast";

// 카드 제목: 일치 키워드는 --sos-accent 글자(바탕 없음). 글자를 드래그로 고르면 "+ 핵심 / + 확장 / − 제외" 메뉴 (설계서 §5.5)
const TIER_TEXT: Record<Tier, string> = { core: "핵심", extended: "확장", exclude: "제외" };
const MENU: { tier: Tier; label: string }[] = [
  { tier: "core", label: "+ 핵심" },
  { tier: "extended", label: "+ 확장" },
  { tier: "exclude", label: "− 제외" },
];

type Menu = { term: string; x: number; y: number };

export function HighlightTitle({ title, terms, team }: { title: string; terms: string[]; team: string | null }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  // 제목 안에서 고른 글자만 메뉴를 띄운다
  const readSelection = useCallback(() => {
    const sel = window.getSelection();
    const el = ref.current;
    if (!sel || !el || sel.isCollapsed || sel.rangeCount === 0) return setMenu(null);
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return setMenu(null);
    const term = sel.toString().trim().replace(/\s+/g, " ");
    if (term === "") return setMenu(null);
    const rect = range.getBoundingClientRect();
    setMenu({ term, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // 스크롤하면 메뉴 위치가 어긋나므로 닫는다
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  async function add(tier: Tier) {
    if (!menu || busy) return;
    const term = menu.term;
    setBusy(true);
    try {
      const r = await addKeywordFromSelection(term, tier, team);
      setToast(
        r.ok
          ? { tone: "ok", text: `"${term}"을(를) ${TIER_TEXT[tier]} 키워드로 추가했습니다. [재분석] 후 리드에 반영됩니다.` }
          : { tone: "error", text: r.error ?? "키워드를 추가하지 못했습니다." },
      );
    } catch {
      setToast({ tone: "error", text: "서버와 연결이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
      setMenu(null);
      window.getSelection()?.removeAllRanges();
    }
  }

  const ranges = highlightRanges(title, terms);
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) parts.push({ text: title.slice(at, r.start), hit: false });
    parts.push({ text: title.slice(r.start, r.end), hit: true });
    at = r.end;
  }
  if (at < title.length) parts.push({ text: title.slice(at), hit: false });

  return (
    <>
      <h2
        ref={ref}
        onMouseUp={readSelection}
        onKeyUp={readSelection}
        onTouchEnd={() => setTimeout(readSelection, 0)}
        className="text-base text-[var(--sos-text-strong)]"
      >
        {parts.map((p, i) =>
          p.hit ? (
            <mark key={i} className="bg-transparent text-[var(--sos-accent)]">
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </h2>
      {menu && (
        <div
          role="menu"
          aria-label={`"${menu.term}" 키워드로 추가`}
          // 메뉴를 누를 때 선택이 풀리지 않게
          onMouseDown={(e) => e.preventDefault()}
          style={{ left: menu.x, top: menu.y }}
          className="fixed z-50 flex -translate-x-1/2 gap-1 rounded-[6px] bg-[var(--sos-bg-modal)] p-1 shadow-[0_0_16px_rgba(0,0,0,0.2)]"
        >
          {MENU.map((m) => (
            <button
              key={m.tier}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => add(m.tier)}
              className={`h-8 rounded-[4px] px-3 text-xs font-medium transition-colors duration-200 hover:bg-[var(--sos-bg-modal-2)] disabled:text-[var(--sos-disabled)] ${
                m.tier === "exclude" ? "text-[var(--sos-red)]" : "text-[var(--sos-text)]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      <Toast message={toast} onClose={closeToast} />
    </>
  );
}
