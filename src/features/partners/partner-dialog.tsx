"use client";

// 대시보드의 [+ 파트너사 등록] — 새 영업기회 버튼 아래
import Link from "next/link";
import { useRef } from "react";
import { PartnerForm } from "./partner-form";

export function PartnerDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="rounded-lg border border-line bg-surface/70 px-3 py-1.5 text-xs text-fg backdrop-blur transition-colors hover:border-accent/40"
      >
        + 파트너사 등록
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(480px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">파트너사 등록</h2>
            <button type="button" onClick={() => ref.current?.close()} className="text-muted hover:text-fg" aria-label="닫기">
              ✕
            </button>
          </div>
          <PartnerForm bare />
          <Link href="/partners" className="block text-center text-xs text-muted hover:text-fg">
            등록된 파트너사 전체 보기 →
          </Link>
        </div>
      </dialog>
    </>
  );
}
