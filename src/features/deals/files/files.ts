// 사업 첨부 파일 — 허용 형식·크기 검사. 순수 함수 (테스트: files.test.ts)
// 형식은 브라우저가 알려주는 MIME 대신 확장자로 정한다 (hwp 는 브라우저가 형식을 비워 보내는 일이 많다).
// 저장소(버킷)도 같은 MIME 목록·크기 제한을 따로 강제한다 (supabase/migrations/*_a_deal_files.sql).

export const FILE_BUCKET = "deal-files";
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_FILES_PER_DEAL = 30;
export const NAME_MAX = 150;

export const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
  zip: "application/zip",
};

export const ACCEPT = Object.keys(EXT_MIME).map((e) => `.${e}`).join(",");

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** 파일 이름 정리 — 경로 문자·제어 문자 제거, 길이 제한 (확장자는 지킨다) */
export function cleanName(name: string): string {
  const base = name.replace(/[\u0000-\u001f\u007f/\\]/g, "").replace(/\s+/g, " ").trim();
  if (base.length <= NAME_MAX) return base;
  const ext = extOf(base);
  const keep = NAME_MAX - (ext ? ext.length + 1 : 0);
  return ext ? `${base.slice(0, keep)}.${ext}` : base.slice(0, NAME_MAX);
}

export type FileCheck = { ok: true; name: string; mime: string } | { ok: false; error: string };

export function checkFile(name: unknown, size: unknown): FileCheck {
  if (typeof name !== "string" || typeof size !== "number" || !Number.isFinite(size)) return { ok: false, error: "잘못된 파일입니다." };
  const clean = cleanName(name);
  const mime = EXT_MIME[extOf(clean)];
  if (!clean || !mime) return { ok: false, error: "올릴 수 없는 형식입니다 (PDF·이미지·오피스·한글·ZIP·TXT·CSV)." };
  if (size <= 0) return { ok: false, error: "빈 파일입니다." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: "10MB 이하 파일만 올릴 수 있습니다." };
  return { ok: true, name: clean, mime };
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}
