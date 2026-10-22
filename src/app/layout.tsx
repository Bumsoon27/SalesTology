import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { InstallPrompt } from "@/shared/ui/install-prompt";
import "./globals.css";

// 마루부리 (NAVER, SIL OFL 1.1) — 영문·KS X 1001 한글 2,350자로 줄인 woff2 (fonts/README.md)
const maruBuri = localFont({
  variable: "--font-maruburi",
  display: "swap",
  src: [
    { path: "./fonts/MaruBuri-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/MaruBuri-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/MaruBuri-Bold.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "SalesTology",
  description: "영업의 모든 연결을 한눈에",
  applicationName: "SalesTology",
  // iOS 홈 화면 앱: 주소창 없이 전체 화면, 상태바는 불투명 검정 (헤더와 겹쳐 흐려 보이지 않게)
  appleWebApp: { capable: true, title: "SalesTology", statusBarStyle: "black" },
  icons: { apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 키보드가 올라오면 화면 높이를 줄여 입력칸이 가려지지 않게
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${maruBuri.variable} h-full antialiased`}>
      {/* dvh: 모바일 주소창이 나타나고 사라져도 높이가 튀지 않게 */}
      <body className="flex h-dvh flex-col bg-bg font-sans text-fg">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
