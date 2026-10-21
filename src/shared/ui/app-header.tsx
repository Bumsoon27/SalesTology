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
      className={`rounded-md px-3 py-1 text-xs transition-colors ${on ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
    >
      {label}
    </Link>
  );

  return (
    <header className="relative z-30 grid h-12 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line bg-bg/80 px-4 backdrop-blur">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoMark size={24} />
          <LogoWordmark className="text-sm" />
        </Link>
        <nav className="flex gap-0.5 rounded-lg border border-line p-0.5">
          {tab("/dashboard", "SalesTology", active === "core")}
          {tab("/sos", "SOS", active === "sos")}
        </nav>
      </div>
      <div className="flex min-w-0 justify-center">
        <Suspense fallback={<span className="h-7 w-64 animate-pulse rounded-full bg-white/5" />}>
          <HeaderTicker />
        </Suspense>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Suspense fallback={<span className="text-muted">…</span>}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}

async function UserMenu() {
  const user = await requireUser();
  return (
    <>
      <span className="mr-1 text-muted">
        <span className="text-fg">{user.name}</span> · {user.loginId}
      </span>
      {user.role === "admin" && (
        <Link href="/admin" className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">
          관리자
        </Link>
      )}
      <Link href="/me" className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">
        마이페이지
      </Link>
      <form action={signOut}>
        <button type="submit" className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">
          로그아웃
        </button>
      </form>
    </>
  );
}
