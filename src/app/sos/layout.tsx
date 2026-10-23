import { AppHeader } from "@/shared/ui/app-header";
import "./sos-theme.css";

// SOS 영역 공통 틀: 공용 상단 바 아래를 SOS 전용 다크 테마로 감싼다 (시각 설계서 §7).
// 로그인 확인은 proxy.ts 와 AppHeader 가 한다. 세션을 읽는 컴포넌트는 <Suspense> 안에 둔다.
const PRETENDARD = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

export default function SosLayout({ children }: LayoutProps<"/sos">) {
  return (
    <>
      {/* React 19 가 <head> 로 올린다. SOS 화면에서만 불러온다 */}
      <link rel="stylesheet" href={PRETENDARD} precedence="default" />
      <AppHeader active="sos" />
      {/* 페이지 가로 스크롤은 없다 (시각 설계서 §6) — 넘치는 것은 각 화면에서 줄바꿈·시트로 처리하고, 여기는 안전망 */}
      <div className="sos-theme min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
    </>
  );
}
