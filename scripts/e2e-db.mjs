// 로컬 Supabase 에서 권한(RLS)·저장소 규칙을 실제로 확인하는 통합 검사 (CI 'DB 검증'에서 실행)
// 운영 DB 는 건드리지 않는다. 사용자·비밀번호는 실행할 때마다 새로 만드는 일회용 값.
// 사용: SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… node scripts/e2e-db.mjs
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_KEY;
if (!url || !anon || !service) {
  console.error("SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY 가 필요합니다.");
  process.exit(1);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  console.error("로컬 Supabase 에서만 실행합니다.");
  process.exit(1);
}

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, service, opts);
const BUCKET = "deal-files";
let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed++;
};

async function makeUser(loginId, joinCode) {
  const password = randomBytes(18).toString("base64url");
  const email = `${loginId}@salestology.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const { data: team, error: tErr } = await admin.from("teams").select("id").eq("join_code", joinCode).single();
  if (tErr) throw tErr;
  const { error: pErr } = await admin.from("profiles").upsert({ id: data.user.id, login_id: loginId, name: loginId, role: "member", team_id: team.id, is_active: true });
  if (pErr) throw pErr;
  const client = createClient(url, anon, opts);
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { id: data.user.id, teamId: team.id, client };
}

async function main() {
  const suffix = randomBytes(3).toString("hex");
  const a = await makeUser(`e2ea${suffix}`, "1000");
  const b = await makeUser(`e2eb${suffix}`, "2000"); // 다른 부문

  const { data: company, error: cErr } = await admin.from("companies").insert({ team_id: a.teamId, name: `검사은행${suffix}` }).select("id").single();
  if (cErr) throw cErr;
  const { data: deal, error: dErr } = await admin
    .from("deals")
    .insert({ team_id: a.teamId, owner_id: a.id, customer_id: company.id, name: "통합 검사 사업", contract_type: "competitive" })
    .select("id")
    .single();
  if (dErr) throw dErr;

  // ── 첨부 파일 ─────────────────────────────────────
  const { data: row, error: insErr } = await a.client.from("deal_files").insert({ deal_id: deal.id, uploader_id: a.id, name: "견적서.pdf", size: 10, mime: "application/pdf" }).select("id").single();
  check(!insErr && row, "같은 부문 사용자는 파일 기록을 만든다");
  const { error: bIns } = await b.client.from("deal_files").insert({ deal_id: deal.id, uploader_id: b.id, name: "x.pdf", size: 10, mime: "application/pdf" });
  check(!!bIns, "다른 부문 사용자는 파일 기록을 만들 수 없다");
  const { error: preConfirmed } = await a.client.from("deal_files").insert({ deal_id: deal.id, uploader_id: a.id, name: "y.pdf", size: 10, mime: "application/pdf", uploaded_at: new Date().toISOString() });
  check(!!preConfirmed, "사용자가 '올림 확인'을 직접 표시할 수 없다");

  const path = `${deal.id}/${row.id}`;
  const body = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  const { error: upErr } = await a.client.storage.from(BUCKET).uploadToSignedUrl(path, signed.token, body, { contentType: "application/pdf" });
  check(!upErr, `서명 URL 로 올리기 ${upErr ? upErr.message : ""}`);

  const { error: again } = await a.client.storage.from(BUCKET).uploadToSignedUrl(path, signed.token, body, { contentType: "application/pdf" });
  check(!!again, "같은 서명 URL 로 덮어쓰기는 안 된다");

  const htmlPath = `${deal.id}/${randomUUID()}`;
  const { data: s2 } = await admin.storage.from(BUCKET).createSignedUploadUrl(htmlPath);
  const { error: htmlErr } = await a.client.storage.from(BUCKET).uploadToSignedUrl(htmlPath, s2.token, new Blob(["<script>1</script>"]), { contentType: "text/html" });
  check(!!htmlErr, "버킷이 허용하지 않는 형식(html)은 거절");

  const bigPath = `${deal.id}/${randomUUID()}`;
  const { data: s3 } = await admin.storage.from(BUCKET).createSignedUploadUrl(bigPath);
  const { error: bigErr } = await a.client.storage.from(BUCKET).uploadToSignedUrl(bigPath, s3.token, new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), { contentType: "application/pdf" });
  check(!!bigErr, "10MB 넘는 파일은 거절");

  const { data: info } = await admin.storage.from(BUCKET).info(path);
  check(Number(info?.size) === 13, "올린 크기를 저장소에서 확인");
  await admin.from("deal_files").update({ uploaded_at: new Date().toISOString(), size: Number(info.size) }).eq("id", row.id);

  const { data: aList } = await a.client.from("deal_files").select("id").eq("deal_id", deal.id).not("uploaded_at", "is", null);
  const { data: bList } = await b.client.from("deal_files").select("id").eq("deal_id", deal.id);
  check(aList?.length === 1, "같은 부문은 목록에서 본다");
  check((bList ?? []).length === 0, "다른 부문은 목록에서 못 본다");

  const { error: direct } = await a.client.storage.from(BUCKET).download(path);
  check(!!direct, "사용자 토큰으로 저장소 직접 받기는 안 된다 (버킷 정책 없음)");
  const { data: list } = await a.client.storage.from(BUCKET).list(deal.id);
  check((list ?? []).length === 0, "사용자 토큰으로 버킷 목록을 볼 수 없다");

  const { data: dl } = await admin.storage.from(BUCKET).createSignedUrl(path, 60, { download: "견적서.pdf" });
  const res = await fetch(dl.signedUrl);
  check(res.ok && (await res.text()) === "%PDF-1.4 test", "서명 URL 로 받기");
  check((res.headers.get("content-disposition") ?? "").includes("attachment"), "받기는 항상 다운로드(attachment)");

  const { data: bDel } = await b.client.from("deal_files").delete().eq("id", row.id).select("id");
  check((bDel ?? []).length === 0, "다른 부문은 지울 수 없다");
  const { data: aDel } = await a.client.from("deal_files").delete().eq("id", row.id).select("id");
  check(aDel?.length === 1, "올린 사람은 지운다");
  await admin.storage.from(BUCKET).remove([path]);

  // ── 경쟁사 ───────────────────────────────────────
  const { error: compErr } = await a.client.from("deal_competitors").insert({ deal_id: deal.id, created_by: a.id, name: "LG CNS", bid_amount: 100 });
  check(!compErr, "경쟁사 기록");
  const { error: dupErr } = await a.client.from("deal_competitors").insert({ deal_id: deal.id, created_by: a.id, name: " lg cns " });
  check(dupErr?.code === "23505", "같은 경쟁사 중복 불가 (대소문자·공백 무시)");
  const { error: refErr } = await a.client.from("deal_competitors").insert({ deal_id: deal.id, created_by: a.id, name: "삼성SDS", source_ref: "sos:x" });
  check(!!refErr, "사용자는 source_ref 를 넣을 수 없다");
  const { data: bComp } = await b.client.from("deal_competitors").select("id").eq("deal_id", deal.id);
  check((bComp ?? []).length === 0, "다른 부문은 경쟁사 기록을 못 본다");

  // ── 목표 ─────────────────────────────────────────
  const { error: tErr } = await a.client.from("sales_targets").insert({ team_id: a.teamId, owner_id: null, month: "2026-10-01", amount: 1000 });
  check(!tErr, "부문 구성원은 부문 목표를 정한다");
  const { error: tbErr } = await b.client.from("sales_targets").insert({ team_id: a.teamId, owner_id: null, month: "2026-11-01", amount: 1000 });
  check(!!tbErr, "다른 부문 목표는 정할 수 없다");
  const { error: toErr } = await b.client.from("sales_targets").insert({ team_id: a.teamId, owner_id: a.id, month: "2026-11-01", amount: 1000 });
  check(!!toErr, "남의 개인 목표는 정할 수 없다");

  console.log(failed ? `\n실패 ${failed}건` : "\n모두 통과");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
