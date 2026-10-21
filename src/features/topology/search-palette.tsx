"use client";

// 검색 (설계서 §6.3): 회사명·사업명으로 찾아 해당 노드로 이동. Ctrl+K 또는 / 로 연다.
import { useEffect, useMemo, useRef, useState } from "react";
import type { UniverseNode } from "./types";

const KIND_LABEL: Record<UniverseNode["kind"], string> = { me: "나", member: "팀원", customer: "고객사", deal: "영업기회", party: "파트너" };
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function SearchPalette({ nodes, onPick }: { nodes: UniverseNode[]; onPick: (n: UniverseNode) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // 같은 회사가 여러 사업에 파트너로 있으면 한 번만 보여준다
  const results = useMemo(() => {
    const n = norm(q);
    const seen = new Set<string>();
    return nodes
      .filter((x) => x.kind !== "me" && (!n || norm(x.label).includes(n)))
      .filter((x) => {
        const key = x.refId ?? x.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  }, [nodes, q]);

  const pick = (n: UniverseNode | undefined) => {
    if (!n) return;
    onPick(n);
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface/70 px-3 py-1.5 text-xs text-muted backdrop-blur hover:text-fg"
      >
        검색 <kbd className="hidden rounded border border-line px-1 text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[14vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  pick(results[active]);
                }
              }}
              placeholder="고객사·영업기회·파트너 이름으로 검색"
              className="w-full border-b border-line bg-transparent px-5 py-4 text-sm outline-none"
            />
            <ul className="max-h-[50vh] overflow-y-auto py-2">
              {results.length === 0 && <li className="px-5 py-3 text-sm text-muted">찾는 결과가 없습니다.</li>}
              {results.map((n, i) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(n)}
                    className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm ${i === active ? "bg-white/5" : ""}`}
                  >
                    <span className="w-14 shrink-0 text-[11px] text-muted">{KIND_LABEL[n.kind]}</span>
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.reason && <span className="shrink-0 text-[11px] text-st-yellow">{n.reason}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
