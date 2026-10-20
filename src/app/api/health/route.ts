import { NextResponse } from "next/server";
import { publicSupabaseEnv } from "@/shared/supabase/env";

// 배포 확인용: Supabase 연결·키 유효성, 어느 환경·커밋이 떠 있는지 보여준다.
// 테이블은 조회하지 않는다 — 비로그인(anon)은 RLS·권한으로 모든 테이블이 막혀 있는 게 정상이다.
export async function GET() {
  let supabase: "connected" | "error" = "error";
  try {
    const { url, key } = publicSupabaseEnv();
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store" });
    if (res.ok) supabase = "connected";
  } catch {
    // 환경변수 누락 또는 네트워크 오류
  }

  return NextResponse.json(
    {
      ok: supabase === "connected",
      supabase,
      env: process.env.VERCEL_ENV ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    },
    { status: supabase === "connected" ? 200 : 503 },
  );
}
