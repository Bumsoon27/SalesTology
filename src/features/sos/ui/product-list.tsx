"use client";

import { useCallback, useState, type FormEvent } from "react";
import { PRODUCT_NAME_MAX, VENDOR_MAX } from "../lib/keyword-edit";
import { addProduct, deleteProduct, updateProduct } from "../server/settings-actions";
import type { SettingsProduct } from "../server/settings-queries";
import { dangerButton, secondaryButton, smallField } from "./sos-styles";
import { Toast, type ToastMessage } from "./toast";

// 제안할 제품 목록 편집 (설계서 §2.3). 키워드 연결은 칩 설정 창에서 한다
type Result = { ok: boolean; error?: string };

export function ProductList({ products, linkCount, team }: { products: SettingsProduct[]; linkCount: Record<string, number>; team: string | null }) {
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", vendor: "" });
  const [fresh, setFresh] = useState({ name: "", vendor: "" });
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  async function run(call: () => Promise<Result>, done: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      const r = await call();
      setToast(r.ok ? { tone: "ok", text: done } : { tone: "error", text: r.error ?? "저장하지 못했습니다." });
      return r.ok;
    } catch {
      setToast({ tone: "error", text: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (await run(() => addProduct(fresh, team), `"${fresh.name.trim()}"을(를) 추가했습니다.`)) setFresh({ name: "", vendor: "" });
  }

  async function onSave(id: string) {
    if (await run(() => updateProduct(id, draft, team), "제품을 고쳤습니다.")) setEditId(null);
  }

  async function onDelete(p: SettingsProduct) {
    if (await run(() => deleteProduct(p.id, team), `"${p.name}"을(를) 삭제했습니다.`)) setConfirmId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {products.length === 0 ? (
        <p className="text-xs text-[var(--sos-text-hint)]">아직 제품이 없습니다.</p>
      ) : (
        <ul className="flex flex-col">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--sos-divider-lite)] py-3 last:border-b-0">
              {editId === p.id ? (
                <span className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <input
                    aria-label="제품 이름"
                    value={draft.name}
                    maxLength={PRODUCT_NAME_MAX}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className={`${smallField} min-w-0 flex-1`}
                  />
                  <input
                    aria-label="공급사"
                    value={draft.vendor}
                    maxLength={VENDOR_MAX}
                    placeholder="공급사"
                    onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
                    className={`${smallField} w-32`}
                  />
                </span>
              ) : (
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-[var(--sos-text-strong)]">{p.name}</span>
                  <span className="text-xs font-medium text-[var(--sos-text-sub)]">
                    {p.vendor ?? "공급사 미입력"} · 연결 키워드 <span className="sos-num">{linkCount[p.id] ?? 0}</span>
                  </span>
                </span>
              )}
              <span className="flex items-center gap-2">
                {editId === p.id ? (
                  <>
                    <button type="button" onClick={() => setEditId(null)} className={secondaryButton}>
                      취소
                    </button>
                    <button type="button" onClick={() => void onSave(p.id)} disabled={busy} className={secondaryButton}>
                      저장
                    </button>
                  </>
                ) : confirmId === p.id ? (
                  <>
                    <button type="button" onClick={() => setConfirmId(null)} className={secondaryButton}>
                      취소
                    </button>
                    {/* 제품을 지우면 키워드 연결도 같이 지워진다 */}
                    <button type="button" onClick={() => void onDelete(p)} disabled={busy} className={dangerButton}>
                      삭제 확인
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(p.id);
                        setConfirmId(null);
                        setDraft({ name: p.name, vendor: p.vendor ?? "" });
                      }}
                      className={secondaryButton}
                    >
                      고치기
                    </button>
                    <button type="button" onClick={() => setConfirmId(p.id)} className={dangerButton}>
                      삭제
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap gap-2">
        <input
          aria-label="새 제품 이름"
          value={fresh.name}
          maxLength={PRODUCT_NAME_MAX}
          placeholder="제품 이름"
          onChange={(e) => setFresh({ ...fresh, name: e.target.value })}
          className={`${smallField} min-w-0 flex-1`}
        />
        <input
          aria-label="새 제품 공급사"
          value={fresh.vendor}
          maxLength={VENDOR_MAX}
          placeholder="공급사"
          onChange={(e) => setFresh({ ...fresh, vendor: e.target.value })}
          className={`${smallField} w-32`}
        />
        <button type="submit" disabled={busy || fresh.name.trim() === ""} className={secondaryButton}>
          제품 추가
        </button>
      </form>
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}
