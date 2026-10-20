import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "./env";

// 서버 컴포넌트·서버 액션·라우트 핸들러용. 로그인 사용자 권한(RLS)으로 동작한다.
export async function createClient() {
  // Supabase 세션 확인은 현재 시각(Date.now)을 쓰므로 반드시 요청 시점에 실행되어야 한다 (Next 16 cacheComponents)
  await connection();
  const cookieStore = await cookies();
  const { url, key } = publicSupabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts 가 담당한다.
        }
      },
    },
  });
}
