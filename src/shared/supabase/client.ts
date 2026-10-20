"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "./env";

// 브라우저 컴포넌트용 (Realtime 구독 포함). RLS가 그대로 적용된다.
export function createClient() {
  const { url, key } = publicSupabaseEnv();
  return createBrowserClient(url, key);
}
