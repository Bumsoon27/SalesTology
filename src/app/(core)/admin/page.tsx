import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/shared/ui/app-header";
import { requireUser } from "@/shared/auth/current-user";
import { getAdminData } from "@/features/admin/queries";
import { DeletedPanel, TeamsPanel, UsersPanel } from "@/features/admin/admin-panels";

// 관리자 화면 (설계서 §5.4): 부문·가입 코드, 사용자 비활성화, 삭제 복구
export default function AdminPage() {
  return (
    <>
      <AppHeader active="core" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-6">
        <h1 className="text-lg font-semibold">관리자</h1>
        <Suspense fallback={<p className="text-sm text-muted">불러오는 중…</p>}>
          <AdminBody />
        </Suspense>
      </main>
    </>
  );
}

async function AdminBody() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  const { teams, users, deleted } = await getAdminData();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <TeamsPanel teams={teams} />
        <DeletedPanel items={deleted} />
      </div>
      <UsersPanel users={users} meId={user.id} />
    </div>
  );
}
