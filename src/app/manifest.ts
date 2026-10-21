import type { MetadataRoute } from "next";

// 홈 화면에 앱으로 설치 (PWA). 아이콘은 scripts/generate-icons.mjs 로 만든다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SalesTology",
    short_name: "SalesTology",
    description: "영업의 모든 연결을 한눈에",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#050507",
    theme_color: "#050507",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
