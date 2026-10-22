import { Suspense } from "react";
import { AppHeader } from "@/shared/ui/app-header";
import { requireUser } from "@/shared/auth/current-user";
import { NameForm, PasswordForm } from "@/features/profile/profile-forms";

// 마이페이지: 실명·비밀번호 수정
export default function MyPage() {
  return (
    <>
      <AppHeader active="core" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
        <h1 className="text-lg font-semibold">마이페이지</h1>
        <Suspense fallback={<p className="text-sm text-muted">불러오는 중…</p>}>
          <MyProfile />
        </Suspense>
      </main>
    </>
  );
}

async function MyProfile() {
  const user = await requireUser();
  const row = (k: string, v: string) => (
    <div className="flex justify-between border-b border-line py-2.5 text-sm last:border-0">
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-surface/70 px-6 py-3">
          {row("ID", user.loginId)}
          {row("부문", user.teamName ?? "-")}
          {row("권한", user.role === "admin" ? "관리자" : "구성원")}
        </section>
        <NameForm name={user.name} />
      </div>
      <PasswordForm />
    </div>
  );
}
