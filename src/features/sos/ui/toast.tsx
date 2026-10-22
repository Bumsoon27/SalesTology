"use client";

import { useEffect } from "react";

// 토스트 (시각 설계서 §5.6) — modal 표면, 오류는 왼쪽 4px 빨간 띠. 몇 초 뒤 저절로 닫힌다
export type ToastMessage = { tone: "error" | "ok"; text: string };

const HIDE_MS = 4000;

export function Toast({ message, onClose }: { message: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, HIDE_MS);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div
      role={message.tone === "error" ? "alert" : "status"}
      className={`fixed bottom-6 left-1/2 z-50 w-[calc(100vw-32px)] max-w-[480px] min-w-0 -translate-x-1/2 rounded-[6px] bg-[var(--sos-bg-modal)] px-6 py-3.5 text-sm text-[var(--sos-text)] shadow-[0_0_16px_rgba(0,0,0,0.2)] sm:w-auto sm:min-w-[320px] ${
        message.tone === "error" ? "border-l-4 border-[var(--sos-red)]" : ""
      }`}
    >
      {message.text}
    </div>
  );
}
