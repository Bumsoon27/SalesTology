"use client";

// 상세 패널 '첨부 파일' — 견적서·제안서·계약서. 서버가 권한을 확인한 뒤 준 서명 URL 로 저장소에 바로 올린다
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/shared/supabase/client";
import { confirmUpload, deleteDealFile, getFileUrl, listDealFiles, requestUpload, type DealFile } from "./actions";
import { ACCEPT, checkFile, FILE_BUCKET, formatBytes } from "./files";

const mini = "rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-fg";

export function FilesSection({ dealId }: { dealId: string }) {
  const [files, setFiles] = useState<DealFile[] | null>(null);
  const [canUpload, setCanUpload] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await listDealFiles(dealId);
    if (!r.ok) return setError(r.error);
    setFiles(r.files);
    setCanUpload(r.canUpload);
  }, [dealId]);

  useEffect(() => {
    // 사업이 바뀌면 목록을 다시 받는다 (비동기 결과로 상태를 정한다)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      const pre = checkFile(file.name, file.size);
      if (!pre.ok) return setError(pre.error);
      setBusy(`${pre.name} 올리는 중…`);
      try {
        const req = await requestUpload(dealId, file.name, file.size);
        if (!req.ok) return setError(req.error);
        const { error: upErr } = await createClient().storage.from(FILE_BUCKET).uploadToSignedUrl(req.path, req.token, file, { contentType: req.mime });
        if (upErr) return setError("저장소에 올리지 못했습니다. 형식·크기를 확인하세요.");
        const ok = await confirmUpload(req.fileId);
        if (!ok.ok) return setError(ok.error);
        await load();
      } finally {
        setBusy(null);
        if (input.current) input.current.value = "";
      }
    });

  const download = (f: DealFile) =>
    start(async () => {
      const r = await getFileUrl(f.id);
      if (!r.ok) return setError(r.error);
      window.location.assign(r.url);
    });

  const remove = (f: DealFile) => {
    if (!window.confirm(`'${f.name}' 파일을 지울까요? 되돌릴 수 없습니다.`)) return;
    start(async () => {
      const r = await deleteDealFile(f.id);
      if (!r.ok) return setError(r.error);
      await load();
    });
  };

  return (
    <section className="space-y-2.5 border-t border-line px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">첨부 파일 {files?.length ?? ""}</h3>
        {canUpload && (
          <>
            <button type="button" className={mini} disabled={pending} onClick={() => input.current?.click()}>
              + 파일 올리기
            </button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="hidden"
              aria-label="첨부 파일 고르기"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
          </>
        )}
      </div>
      {busy && <p className="text-[11px] text-accent">{busy}</p>}
      {error && <p className="text-[11px] text-st-red">{error}</p>}
      {files == null ? (
        <p className="text-xs text-muted">불러오는 중…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted">견적서·제안서·계약서를 올려 두면 같은 부문 사람이 함께 볼 수 있습니다. (10MB 이하 · PDF·오피스·한글·이미지·ZIP)</p>
      ) : (
        <ul className={`space-y-1.5 ${pending ? "opacity-60" : ""}`}>
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <button type="button" onClick={() => download(f)} className="min-w-0 truncate text-left hover:text-accent hover:underline" title="받기">
                {f.name}
              </button>
              <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                {formatBytes(f.size)} · {f.uploader}
                {f.mine && (
                  <button type="button" className={mini} onClick={() => remove(f)} aria-label={`${f.name} 지우기`}>
                    ✕
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
