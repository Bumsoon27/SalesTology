import Link from "next/link";
import { LogoMark, LogoWordmark } from "@/shared/ui/logo";
import { Universe } from "@/features/topology/universe";
import { buildDemoUniverse } from "@/features/topology/demo-data";
import { SignupForm } from "./signup-form";

const backdrop = buildDemoUniverse("", 11);

// 부문 코드 가입 (설계서 §5.1)
export default function SignupPage() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 opacity-45" aria-hidden>
        <Universe data={backdrop} interactive={false} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--bg)_75%)]" aria-hidden />

      <div className="relative w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface/70 p-8 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div className="flex flex-col items-center gap-3 pb-1">
          <LogoMark size={48} />
          <LogoWordmark className="text-xl" />
          <p className="text-sm text-muted">부문 코드로 처음 가입하기</p>
        </div>
        <SignupForm />
        <p className="text-center text-xs text-muted">
          이미 계정이 있나요?{" "}
          <Link href="/login" className="text-fg underline-offset-4 hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
