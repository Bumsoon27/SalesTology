import "server-only";

import { createClient } from "@supabase/supabase-js";

// RLS를 우회하는 서버 전용 클라이언트. 가입 처리·관리 작업에만 쓴다.
// 절대 클라이언트 컴포넌트에서 import 하지 않는다 (server-only 가 빌드에서 막아준다).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("SUPABASE_SECRET_KEY 가 설정되지 않았습니다.");
  }
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
