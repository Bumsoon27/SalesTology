import type { NextConfig } from "next";
import { readdirSync } from "node:fs";

// 빌드 시점의 최신 마이그레이션 버전 — 관리자 '시스템 상태'가 운영 DB 와 비교해 자동 반영이 멈췄는지 알려준다.
// 비밀값이 아니다 (파일 이름의 날짜 숫자). 폴더를 못 읽으면 빈 값 (비교를 건너뛴다)
function latestMigration(): string {
  try {
    const files = readdirSync("supabase/migrations").filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
    return files.at(-1)?.slice(0, 14) ?? "";
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    BUILD_LATEST_MIGRATION: latestMigration(),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
