// 최초 관리자 sbbae 생성 (설계서 §5.3). 여러 번 실행해도 안전하다(멱등).
// 사용: npm run seed:admin   (.env.local 의 URL·SUPABASE_SECRET_KEY·ADMIN_INITIAL_PASSWORD 사용)
import { createClient } from "@supabase/supabase-js";

const LOGIN_ID = "sbbae";
const TEAM_JOIN_CODE = "1000"; // Enterprise사업부문 — 관리자도 자기 부문으로 사업을 등록한다
const EMAIL = `${LOGIN_ID}@salestology.local`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.ADMIN_INITIAL_PASSWORD;

if (!url || !secret || !password) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_INITIAL_PASSWORD 가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserId(): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === EMAIL);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  let userId = await findUserId();

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`관리자 계정 생성: ${LOGIN_ID}`);
  } else {
    console.log(`관리자 계정이 이미 있습니다: ${LOGIN_ID} (비밀번호는 바꾸지 않음)`);
  }

  const { data: team, error: teamError } = await supabase.from("teams").select("id, name").eq("join_code", TEAM_JOIN_CODE).single();
  if (teamError) throw teamError;

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, login_id: LOGIN_ID, name: "관리자", role: "admin", team_id: team.id, is_active: true }, { onConflict: "id" });
  if (error) throw error;
  console.log(`profiles 반영 완료 (소속: ${team.name})`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
