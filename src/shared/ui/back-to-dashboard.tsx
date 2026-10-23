"use client";

import Link, { useLinkStatus } from "next/link";

// 하위 화면(파트너사·마이페이지·관리자) 맨 위 — 대시보드로 돌아가는 버튼.
// 대시보드는 그리는 데 시간이 걸려, 누르자마자 '이동 중'을 보여 눌렸다는 걸 알 수 있게 한다.
function Label() {
  const { pending } = useLinkStatus();
  return pending ? (
    <>
      <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> 이동 중…
    </>
  ) : (
    <>
      <span aria-hidden>←</span> 대시보드로
    </>
  );
}

export function BackToDashboard() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-fg"
    >
      <Label />
    </Link>
  );
}
