"use server";

import { refresh } from "next/cache";
import { createClient } from "@/shared/supabase/server";
import { isStrongPassword } from "@/shared/auth/login-id";

export type ProfileState = { ok: boolean; message?: string; error?: string };

export async function updateMyName(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 30) return { ok: false, error: "이름은 2~30자로 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", { p_name: name });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: "이름을 바꿨습니다. 우주 중심과 영업대표 표시에 바로 반영됩니다." };
}

export async function changeMyPassword(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!isStrongPassword(next)) return { ok: false, error: "새 비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 합니다." };
  if (next !== confirm) return { ok: false, error: "새 비밀번호가 서로 다릅니다." };
  if (next === current) return { ok: false, error: "지금 비밀번호와 다른 비밀번호를 쓰세요." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email;
  if (!email) return { ok: false, error: "다시 로그인해 주세요." };

  // 현재 비밀번호 확인 후 변경
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
  if (verifyError) return { ok: false, error: "현재 비밀번호가 올바르지 않습니다." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "비밀번호를 바꿨습니다." };
}
