import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/shared/auth/actions";
import { requireUser } from "@/shared/auth/current-user";
import { LogoMark, LogoWordmark } from "./logo";

// A·B 공용 상단 바. [SalesTology|SOS] 전환 탭 (설계서 §6.1, §11)
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
    <header className="relative z-10 flex h-12 shrink-0 items-center gap-4 border-b border-line bg-bg/80 px-4 backdrop-blur">
      <Link href="/dashboard" className="flex items-center gap-2">
        <LogoMark size={24} />
        <LogoWordmark className="text-sm" />
      </Link>
      <nav className="flex gap-0.5 rounded-lg border border-line p-0.5">
        {tab("/dashboard", "SalesTology", active === "core")}
        {tab("/sos", "SOS", active === "sos")}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-xs">
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
      <span className="text-muted">
        <span className="text-fg">{user.name}</span> · {user.loginId}
      </span>
      <form action={signOut}>
        <button type="submit" className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">
          로그아웃
        </button>
      </form>
    </>
  );
}
