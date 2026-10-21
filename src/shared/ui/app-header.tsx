import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/shared/auth/actions";
import { requireUser } from "@/shared/auth/current-user";
import { HeaderTicker } from "@/features/notifications/header-ticker";
import { LogoMark, LogoWordmark } from "./logo";

// A·B 공용 상단 바. [SalesTology|SOS] 전환 탭 + 가운데 주요 알림 티커 (설계서 §6.1, §7.2, §11)
export function AppHeader({ active }: { active: "core" | "sos" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1 text-xs transition-colors whitespace-nowrap ${on ? "bg-white/[0.14] font-medium text-white" : "text-[#b4b7c3] hover:text-white"}`}
    >
      {label}
    </Link>
  );

  return (
    <header className="pt-safe relative z-30 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 border-b border-white/10 bg-[#08080b] px-3 py-2 sm:h-12 sm:px-4 sm:py-0">
      <div className="flex items-center gap-3 sm:gap-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoMark size={24} />
          <LogoWordmark className="hidden text-sm sm:inline" />
        </Link>
        <nav className="flex gap-0.5 rounded-lg border border-white/15 p-0.5">
          {tab("/dashboard", "SalesTology", active === "core")}
          {tab("/sos", "SOS", active === "sos")}
        </nav>
      </div>
      {/* 모바일에서는 둘째 줄 전체 폭 */}
      <div className="order-last col-span-3 flex min-w-0 justify-center sm:order-none sm:col-span-1">
        <Suspense fallback={<span className="h-7 w-64 animate-pulse rounded-full bg-white/5" />}>
          <HeaderTicker />
        </Suspense>
      </div>
      <div className="flex items-center justify-end gap-2 text-xs">
        <Suspense fallback={<span className="text-muted">…</span>}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}

async function UserMenu() {
  const user = await requireUser();
  const links = (
    <>
      {user.role === "admin" && (
        <Link href="/admin" className="whitespace-nowrap rounded-md border border-white/15 px-2 py-1 text-[#b4b7c3] hover:text-white">
          관리자
        </Link>
      )}
      <Link href="/me" className="whitespace-nowrap rounded-md border border-white/15 px-2 py-1 text-[#b4b7c3] hover:text-white">
        마이페이지
      </Link>
      <form action={signOut}>
        <button type="submit" className="w-full rounded-md border border-white/15 px-2 py-1 text-left text-[#b4b7c3] hover:text-white">
          로그아웃
        </button>
      </form>
    </>
  );
  return (
    <>
      {/* 모바일: 이름 첫 글자 버튼 하나로 묶는다 */}
      <details className="relative sm:hidden">
        <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full border border-line bg-surface text-sm text-fg">
          {user.name.slice(0, 1)}
        </summary>
        <div className="absolute right-0 top-10 z-40 flex w-44 flex-col gap-1.5 rounded-xl border border-line bg-surface p-2 shadow-2xl">
          <p className="px-1 pb-1 text-muted">
            <span className="text-fg">{user.name}</span> · {user.loginId}
          </p>
          {links}
        </div>
      </details>
      <span className="mr-1 hidden text-muted sm:inline">
        <span className="text-fg">{user.name}</span> · {user.loginId}
      </span>
      <div className="hidden items-center gap-2 sm:flex">{links}</div>
    </>
  );
}
