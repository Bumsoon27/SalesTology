"use server";

// 알림 읽음 처리 — 본인 것만 (notification_reads RLS: user_id = auth.uid()). 키는 계산된 알림 키
import { createClient } from "@/shared/supabase/server";

const MAX_KEYS = 200;
const KEY = /^[a-z_]+:[A-Za-z0-9_:-]{1,190}$/;

export async function markNotificationsRead(keys: string[]): Promise<{ ok: boolean }> {
  if (!Array.isArray(keys)) return { ok: false };
  const clean = [...new Set(keys.filter((k) => typeof k === "string" && KEY.test(k)))].slice(0, MAX_KEYS);
  if (clean.length === 0) return { ok: true };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false };
  const { error } = await supabase
    .from("notification_reads")
    .upsert(
      clean.map((k) => ({ user_id: auth.user!.id, notification_key: k })),
      { onConflict: "user_id,notification_key", ignoreDuplicates: true },
    );
  return { ok: !error };
}
