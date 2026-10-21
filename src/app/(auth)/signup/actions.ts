"use server";

// 부문 코드 가입 (설계서 §5.1). 가입 코드는 서버에서만 검증한다 (클라이언트는 join_code 를 볼 수 없음).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/shared/supabase/admin";
import { createClient } from "@/shared/supabase/server";
import { isStrongPassword, isValidLoginId, toAuthEmail } from "@/shared/auth/login-id";
import { allow } from "@/shared/auth/rate-limit";

export type SignupState = {
  step: "code" | "account";
  code?: string;
  teamName?: string;
  error?: string;
  fieldErrors?: Partial<Record<"code" | "loginId" | "name" | "password" | "confirm", string>>;
};

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

async function findTeam(code: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("teams").select("id, name").eq("join_code", code).maybeSingle();
  return data;
}

export async function signupStep(prev: SignupState, formData: FormData): Promise<SignupState> {
  if (prev.step === "code" || formData.get("back")) {
    if (formData.get("back")) return { step: "code" };
    const code = String(formData.get("code") ?? "").trim();
    if (!allow(`join:${await clientIp()}`)) {
      return { step: "code", fieldErrors: { code: "시도가 너무 많습니다. 1분 뒤에 다시 시도하세요." } };
    }
    const team = code ? await findTeam(code) : null;
    if (!team) return { step: "code", fieldErrors: { code: "부문 코드가 올바르지 않습니다." } };
    return { step: "account", code, teamName: team.name };
  }

  // 2단계: 계정 만들기
  const code = prev.code ?? "";
  const loginId = String(formData.get("loginId") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors: SignupState["fieldErrors"] = {};
  if (!isValidLoginId(loginId)) fieldErrors.loginId = "ID는 영문 소문자·숫자 4~20자입니다.";
  if (name.length < 2 || name.length > 30) fieldErrors.name = "이름(실명)은 2~30자입니다.";
  if (!isStrongPassword(password)) fieldErrors.password = "8자 이상, 영문·숫자·특수문자를 모두 포함하세요.";
  if (password !== confirm) fieldErrors.confirm = "비밀번호가 서로 다릅니다.";
  if (Object.keys(fieldErrors).length) return { ...prev, fieldErrors };

  const team = await findTeam(code);
  if (!team) return { step: "code", fieldErrors: { code: "부문 코드가 바뀌었습니다. 다시 입력하세요." } };

  const admin = createAdminClient();
  const { data: taken } = await admin.from("profiles").select("id").eq("login_id", loginId).maybeSingle();
  if (taken) return { ...prev, fieldErrors: { loginId: "이미 사용 중인 ID입니다." } };

  const { data: created, error } = await admin.auth.admin.createUser({ email: toAuthEmail(loginId), password, email_confirm: true });
  if (error || !created.user) {
    const dup = error?.message.toLowerCase().includes("already");
    return { ...prev, ...(dup ? { fieldErrors: { loginId: "이미 사용 중인 ID입니다." } } : { error: "계정을 만들지 못했습니다. 잠시 뒤 다시 시도하세요." }) };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: created.user.id, login_id: loginId, name, team_id: team.id, role: "member", is_active: true });
  if (profileError) {
    // 프로필이 없으면 로그인해도 쓸 수 없으므로 계정을 되돌린다
    await admin.auth.admin.deleteUser(created.user.id);
    return { ...prev, error: "계정을 만들지 못했습니다. 잠시 뒤 다시 시도하세요." };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: toAuthEmail(loginId), password });
  redirect("/dashboard");
}
