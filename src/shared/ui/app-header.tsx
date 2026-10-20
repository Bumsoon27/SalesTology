import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/shared/auth/actions";
import { requireUser } from "@/shared/auth/current-user";

// A·B 공용 상단 바. [SalesTology|SOS] 전환 탭 (설계서 §6.1, §11)
export function AppHeader({ active }: { active: "core" | "sos" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded px-3 py-1 text-sm ${on ? "bg-black text-white" : "text-gray-600"}`}>
      {label}
    </Link>
  );

  return (
    <header className="flex items-center gap-4 border-b px-4 py-2">
      <span className="font-semibold">SalesTology</span>
      <nav className="flex gap-1 rounded border p-0.5">
        {tab("/dashboard", "SalesTology", active === "core")}
        {tab("/sos", "SOS", active === "sos")}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <Suspense fallback={<span className="text-gray-400">…</span>}>
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
      <span>
        {user.name} ({user.loginId})
      </span>
      <form action={signOut}>
        <button type="submit" className="text-gray-500 underline">로그아웃</button>
      </form>
    </>
  );
}
