import { Suspense } from "react";
import { signIn } from "@/shared/auth/actions";
import { LogoMark, LogoWordmark } from "@/shared/ui/logo";
import { Universe } from "@/features/topology/universe";
import { buildDemoUniverse } from "@/features/topology/demo-data";

const ERRORS: Record<string, string> = {
  invalid: "ID 또는 비밀번호가 올바르지 않습니다.",
  inactive: "비활성화된 계정입니다. 관리자에게 문의하세요.",
};

const backdrop = buildDemoUniverse("", 3);

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 opacity-45" aria-hidden>
        <Universe data={backdrop} interactive={false} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--bg)_75%)]" aria-hidden />

      <form
        action={signIn}
        className="relative w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface/70 p-8 shadow-2xl shadow-black/60 backdrop-blur-xl"
      >
        <div className="flex flex-col items-center gap-3 pb-2">
          <LogoMark size={56} />
          <LogoWordmark className="text-2xl" />
          <p className="text-sm text-muted">영업의 모든 연결을 한눈에</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-muted">ID</span>
          <input name="loginId" required autoComplete="username" className="field" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-muted">비밀번호</span>
          <input name="password" type="password" required autoComplete="current-password" className="field" />
        </label>
        <Suspense>
          <LoginParams searchParams={searchParams} />
        </Suspense>
        <button type="submit" className="btn-primary">
          로그인
        </button>
        <p className="text-center text-xs text-muted">
          처음이신가요?{" "}
          <a href="/signup" className="text-fg underline-offset-4 hover:underline">
            부문 코드로 가입
          </a>
        </p>
      </form>
    </main>
  );
}

// 요청마다 달라지는 값(오류 메시지, 돌아갈 주소)만 Suspense 안에서 읽는다.
async function LoginParams({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const next = typeof params.next === "string" ? params.next : "/dashboard";
  return (
    <>
      <input type="hidden" name="next" value={next} />
      {error && <p className="text-sm text-st-red">{error}</p>}
    </>
  );
}
