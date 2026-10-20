import { NextResponse } from "next/server";
import { createClient } from "@/shared/supabase/server";

// 배포 확인용: 앱과 Supabase 연결 상태, 어느 환경·커밋이 떠 있는지 보여준다.
export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.from("teams").select("id", { head: true, count: "exact" });

  return NextResponse.json(
    {
      ok: !error,
      db: error ? "error" : "connected",
      env: process.env.VERCEL_ENV ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    },
    { status: error ? 503 : 200 },
  );
}
