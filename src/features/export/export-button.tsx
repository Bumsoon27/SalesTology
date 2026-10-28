// 엑셀(CSV) 내려받기 버튼 — 지금 화면의 조회 범위 그대로 (/api/export/deals)
import { scopeHref, type ViewScope } from "@/features/deals/scope";

export function ExportButton({ scope }: { scope: ViewScope }) {
  return (
    <a
      href={scopeHref("/api/export/deals", scope)}
      download
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-fg"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
      </svg>
      엑셀 다운로드
    </a>
  );
}
