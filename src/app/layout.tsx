import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { InstallPrompt } from "@/shared/ui/install-prompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      {/* dvh: 모바일 주소창이 나타나고 사라져도 높이가 튀지 않게 */}
      <body className="flex h-dvh flex-col bg-bg text-fg">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
