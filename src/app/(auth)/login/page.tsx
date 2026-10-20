import { Suspense } from "react";
import { signIn } from "@/shared/auth/actions";

const ERRORS: Record<string, string> = {
  invalid: "ID 또는 비밀번호가 올바르지 않습니다.",
  inactive: "비활성화된 계정입니다. 관리자에게 문의하세요.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={signIn} className="w-full max-w-sm space-y-4 rounded-xl border p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">SalesTology</h1>
        <label className="block space-y-1">
          <span className="text-sm">ID</span>
          <input name="loginId" required autoComplete="username" className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">비밀번호</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <Suspense>
          <LoginParams searchParams={searchParams} />
        </Suspense>
        <button type="submit" className="w-full rounded bg-black px-3 py-2 text-white">
          로그인
        </button>
        <p className="text-center text-sm text-gray-500">
          처음이신가요? <a href="/signup" className="underline">부문 코드로 가입</a>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  );
}
