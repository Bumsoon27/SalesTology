"use client";

// 헤더 알림 종 — 안 읽은 수 배지, 누르면 전체 목록(안 읽은 것 먼저). 항목을 누르면 읽음 처리 후 그 사업으로
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { markNotificationsRead } from "./actions";
import type { AppNotification } from "./build";
import { DOT } from "./ticker";

export function Bell({ items, readKeys }: { items: AppNotification[]; readKeys: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // 서버 값에 방금 읽은 것을 더한다 (새로고침을 기다리지 않고 바로 반영)
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  const isRead = (k: string) => localRead.has(k) || readKeys.includes(k);
  const unread = items.filter((i) => !isRead(i.key));
  const sorted = [...unread, ...items.filter((i) => isRead(i.key))];

  // 바깥을 누르거나 Esc 로 닫힌다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const mark = (keys: string[]) => {
    if (keys.length === 0) return;
    setLocalRead((s) => new Set([...s, ...keys]));
    start(async () => {
      await markNotificationsRead(keys);
    });
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`알림 ${unread.length}개 안 읽음`}
        className="relative flex h-8 w-8 items-center justify-center rounded-md border border-white/15 text-[#b4b7c3] hover:text-white"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-st-red px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-[min(360px,calc(100vw-24px))] animate-[fadeIn_.16s_ease-out] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold">
              알림 <span className="text-xs font-normal text-muted">안 읽음 {unread.length}</span>
            </p>
            {unread.length > 0 && (
              <button type="button" onClick={() => mark(unread.map((i) => i.key))} className="text-[11px] text-muted hover:text-fg">
                모두 읽음
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">새 알림이 없습니다.</p>
          ) : (
            <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
              {sorted.map((n) => {
                const read = isRead(n.key);
                return (
                  <li key={n.key}>
                    <button
                      type="button"
                      onClick={() => {
                        mark([n.key]);
                        setOpen(false);
                        router.push(n.href);
                      }}
                      className={`flex w-full gap-2.5 px-4 py-2.5 text-left text-xs hover:bg-white/5 ${read ? "opacity-55" : ""}`}
                    >
                      <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[n.kind]}`} />
                      <span className="min-w-0 flex-1 leading-snug">
                        {n.source && <span className="mr-1 rounded bg-white/10 px-1 py-px text-[10px] text-muted">{n.source}</span>}
                        {n.text}
                      </span>
                      {!read && <span aria-label="안 읽음" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-line px-4 py-2 text-[10px] text-muted">알림은 매일 새로 계산됩니다 · 상황이 해결되면 목록에서 사라집니다</p>
        </div>
      )}
    </div>
  );
}
