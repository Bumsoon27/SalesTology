"use server";

// 사업 첨부 파일 — 권한은 deal_files 표의 RLS(사용자 권한)로 먼저 확인하고,
// 저장소(비공개 버킷, 정책 없음)는 확인이 끝난 뒤에만 서비스 키로 짧은 서명 URL 을 만든다.
// 경로는 서버가 정한다(<deal_id>/<file_id>) — 요청값의 파일 이름은 표시용으로만 쓴다.
import { requireUser } from "@/shared/auth/current-user";
import { createAdminClient } from "@/shared/supabase/admin";
import { createClient } from "@/shared/supabase/server";
import { checkFile, FILE_BUCKET, MAX_FILE_BYTES, MAX_FILES_PER_DEAL } from "./files";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const pathOf = (dealId: string, fileId: string) => `${dealId}/${fileId}`;

export type DealFile = { id: string; name: string; size: number; mime: string; uploadedAt: string; uploader: string; mine: boolean };
type Fail = { ok: false; error: string };

export async function listDealFiles(dealId: string): Promise<{ ok: true; files: DealFile[]; canUpload: boolean } | Fail> {
  if (!isId(dealId)) return { ok: false, error: "잘못된 요청입니다." };
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal_files")
    .select("id, name, size, mime, uploaded_at, uploader_id, uploader:profiles ( name )")
    .eq("deal_id", dealId)
    .not("uploaded_at", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(MAX_FILES_PER_DEAL);
  if (error) return { ok: false, error: "첨부 파일을 불러오지 못했습니다." };
  type Row = { id: string; name: string; size: number; mime: string; uploaded_at: string; uploader_id: string; uploader: { name: string } | null };
  const files = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    size: Number(r.size),
    mime: r.mime,
    uploadedAt: r.uploaded_at,
    uploader: r.uploader?.name ?? "-",
    mine: r.uploader_id === user.id || user.role === "admin",
  }));
  return { ok: true, files, canUpload: files.length < MAX_FILES_PER_DEAL };
}

/** 1단계: 기록을 만들고(RLS 로 권한 확인) 올리기용 서명 URL 토큰을 준다 */
export async function requestUpload(dealId: string, name: string, size: number): Promise<{ ok: true; fileId: string; path: string; token: string; mime: string } | Fail> {
  if (!isId(dealId)) return { ok: false, error: "잘못된 요청입니다." };
  const check = checkFile(name, size);
  if (!check.ok) return check;
  const user = await requireUser();
  const supabase = await createClient();
  const admin = createAdminClient();

  // 한 시간 넘게 확인되지 않은 내 올리기(중단된 것)는 정리
  const stale = new Date(Date.now() - 3_600_000).toISOString();
  const { data: old } = await supabase.from("deal_files").delete().eq("uploader_id", user.id).is("uploaded_at", null).lt("created_at", stale).select("id, deal_id");
  if (old?.length) await admin.storage.from(FILE_BUCKET).remove(old.map((o) => pathOf(o.deal_id, o.id)));

  const { count } = await supabase.from("deal_files").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  if ((count ?? 0) >= MAX_FILES_PER_DEAL) return { ok: false, error: `한 사업에 파일은 ${MAX_FILES_PER_DEAL}개까지 올릴 수 있습니다.` };

  const { data: row, error } = await supabase
    .from("deal_files")
    .insert({ deal_id: dealId, uploader_id: user.id, name: check.name, size, mime: check.mime })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error?.code === "42501" ? "이 사업에 파일을 올릴 권한이 없습니다." : "파일을 올리지 못했습니다." };

  const path = pathOf(dealId, row.id);
  const { data: signed, error: signErr } = await admin.storage.from(FILE_BUCKET).createSignedUploadUrl(path);
  if (signErr || !signed) {
    await supabase.from("deal_files").delete().eq("id", row.id);
    return { ok: false, error: "저장소 연결에 실패했습니다." };
  }
  return { ok: true, fileId: row.id, path, token: signed.token, mime: check.mime };
}

/** 2단계: 실제로 올라갔는지(크기 포함) 확인하고 목록에 보이게 한다 */
export async function confirmUpload(fileId: string): Promise<{ ok: true } | Fail> {
  if (!isId(fileId)) return { ok: false, error: "잘못된 요청입니다." };
  const user = await requireUser();
  const supabase = await createClient();
  const { data: row } = await supabase.from("deal_files").select("id, deal_id, uploader_id, uploaded_at").eq("id", fileId).maybeSingle();
  if (!row || row.uploader_id !== user.id || row.uploaded_at) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const path = pathOf(row.deal_id, row.id);
  const { data: info } = await admin.storage.from(FILE_BUCKET).info(path);
  const actual = Number(info?.size ?? 0);
  if (!info || actual <= 0 || actual > MAX_FILE_BYTES) {
    if (info) await admin.storage.from(FILE_BUCKET).remove([path]);
    await supabase.from("deal_files").delete().eq("id", row.id);
    return { ok: false, error: "파일이 올라가지 않았습니다. 다시 시도하세요." };
  }
  const { error } = await admin.from("deal_files").update({ uploaded_at: new Date().toISOString(), size: actual }).eq("id", row.id).is("uploaded_at", null);
  return error ? { ok: false, error: "파일을 등록하지 못했습니다." } : { ok: true };
}

/** 받기 — 볼 수 있는 파일이면 60초짜리 서명 URL (항상 '다운로드'로 받게 해 브라우저에서 열리지 않게) */
export async function getFileUrl(fileId: string): Promise<{ ok: true; url: string } | Fail> {
  if (!isId(fileId)) return { ok: false, error: "잘못된 요청입니다." };
  await requireUser();
  const supabase = await createClient();
  const { data: row } = await supabase.from("deal_files").select("id, deal_id, name").eq("id", fileId).not("uploaded_at", "is", null).maybeSingle();
  if (!row) return { ok: false, error: "파일을 찾을 수 없습니다." };
  const { data, error } = await createAdminClient().storage.from(FILE_BUCKET).createSignedUrl(pathOf(row.deal_id, row.id), 60, { download: row.name });
  return error || !data ? { ok: false, error: "받기 링크를 만들지 못했습니다." } : { ok: true, url: data.signedUrl };
}

/** 지우기 — 올린 사람·관리자 (RLS). 기록이 지워졌을 때만 파일 본문을 지운다 */
export async function deleteDealFile(fileId: string): Promise<{ ok: true } | Fail> {
  if (!isId(fileId)) return { ok: false, error: "잘못된 요청입니다." };
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("deal_files").delete().eq("id", fileId).select("id, deal_id");
  if (!data?.length) return { ok: false, error: "지울 수 없는 파일입니다 (올린 사람·관리자만)." };
  await createAdminClient().storage.from(FILE_BUCKET).remove([pathOf(data[0].deal_id, data[0].id)]);
  return { ok: true };
}
