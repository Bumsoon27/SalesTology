import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/shared/auth/actions";
import { requireUser } from "@/shared/auth/current-user";
import { HeaderBell, HeaderTicker } from "@/features/notifications/header-ticker";
import { AppNav, AppNavFallback } from "./app-nav";
import { LogoMark, LogoWordmark } from "./logo";

// A·B 공용 상단 바. 주 메뉴 [SalesTology ▸ 대시보드·파이프라인 | SOS] + 가운데 주요 알림 티커 (설계서 §6.1, §7.2, §11)
// active 는 서버에서 정한 현재 영역 — 메뉴는 주소로 하위 항목까지 판단하고, 이 값은 첫 그림의 기준으로 쓴다
export function AppHeader({ active }: { active: "core" | "pipeline" | "sos" }) {
  return (
    // 데스크톱: [로고 | 주 메뉴 | 티커 | 종·사용자] 한 줄
    // 휴대폰: 1줄 [로고 ……… 종·사용자] / 2줄 주 메뉴 / 3줄 티커 — 펼친 메뉴와 종이 한 줄에 들어가지 않아 나눈다
    <header className="pt-safe relative z-30 grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-white/10 bg-[#08080b] px-3 py-2 sm:h-12 sm:grid-cols-[auto_auto_1fr_auto] sm:px-4 sm:py-0">
      <Link href="/dashboard" className="order-1 flex items-center gap-2 justify-self-start">
        <LogoMark size={24} />
        <LogoWordmark className="text-sm" />
      </Link>
      {/* 주소(usePathname)를 읽는 메뉴는 Suspense 안에 (Next 16 사전 렌더 규칙) */}
      <div className="order-3 col-span-2 flex min-w-0 overflow-x-auto sm:order-2 sm:col-span-1 sm:overflow-visible">
        <Suspense fallback={<AppNavFallback active={active} />}>
          <AppNav />
        </Suspense>
      </div>
      <div className="order-4 col-span-2 flex min-w-0 justify-center sm:order-3 sm:col-span-1">
        <Suspense fallback={<span className="h-7 w-64 animate-pulse rounded-full bg-white/5" />}>
          <HeaderTicker />
        </Suspense>
      </div>
      <div className="order-2 flex items-center justify-end gap-2 text-xs sm:order-4">
        <Suspense fallback={<span aria-hidden className="h-8 w-8 rounded-md border border-white/10" />}>
          <HeaderBell />
        </Suspense>
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
