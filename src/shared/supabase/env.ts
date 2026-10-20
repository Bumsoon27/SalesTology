// 공개 가능한 값만 여기서 읽는다. 비밀 키는 admin.ts(server-only)에서만 읽는다.
export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요.",
    );
  }
  return { url, key };
}
