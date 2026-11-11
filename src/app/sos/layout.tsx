import { AppHeader } from "@/shared/ui/app-header";
import "./sos-theme.css";

// SOS 영역 공통 틀: 공용 상단 바 아래를 SOS 전용 다크 테마로 감싼다 (시각 설계서 §7).
// 글꼴은 앱 공통 나눔스퀘어라운드(루트 layout 의 --font-nanum-round)를 그대로 쓴다.
// 로그인 확인은 proxy.ts 와 AppHeader 가 한다. 세션을 읽는 컴포넌트는 <Suspense> 안에 둔다.

export default function SosLayout({ children }: LayoutProps<"/sos">) {
  return (
    <>
      <AppHeader active="sos" />
      {/* 페이지 가로 스크롤은 없다 (시각 설계서 §6) — 넘치는 것은 각 화면에서 줄바꿈·시트로 처리하고, 여기는 안전망 */}
      <div className="sos-theme min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
    </>
  );
}
