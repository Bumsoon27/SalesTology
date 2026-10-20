import { AppHeader } from "@/shared/ui/app-header";

// B 영역(SOS) 진입점. 이 폴더(src/app/sos)와 src/features/sos 는 B 담당이 소유한다.
// 로그인 확인은 proxy.ts 와 AppHeader 가 한다. 세션을 읽는 컴포넌트는 <Suspense> 안에 둔다.
export default function SosPage() {
  return (
    <>
      <AppHeader active="sos" />
      <main className="flex flex-1 items-center justify-center p-6 text-gray-500">
        SOS (Signal-based Outbound Sales) — B 영역 설계서에 따라 구현 예정
      </main>
    </>
  );
}
