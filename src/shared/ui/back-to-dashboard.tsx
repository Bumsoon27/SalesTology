import Link from "next/link";

// 하위 화면(파트너사·마이페이지·관리자) 맨 위 — 대시보드로 돌아가는 버튼
export function BackToDashboard() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-fg"
    >
      <span aria-hidden>←</span> 대시보드로
    </Link>
  );
}
