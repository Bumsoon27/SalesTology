"use client";

import { useCallback, useState } from "react";
import { describeChange, type ChangeAction } from "../lib/keyword-edit";
import { revertKeywordChange } from "../server/settings-actions";
import { secondaryButton } from "./sos-styles";
import { Toast, type ToastMessage } from "./toast";

// 키워드 변경 이력 + [되돌리기] (설계서 §5.4). 되돌리기도 새 이력으로 남는다
export type ChangeLogItem = {
  id: number;
  action: ChangeAction;
  before: unknown;
  after: unknown;
  // 서버에서 KST 로 만든 글자 (서버·브라우저 표시가 어긋나지 않게)
  whenText: string;
  actorName: string | null;
  term: string | null;
};

export function ChangeLog({ items, team }: { items: ChangeLogItem[]; team: string | null }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  async function revert(c: ChangeLogItem) {
    if (busyId !== null) return;
    setBusyId(c.id);
    try {
      const r = await revertKeywordChange(c.id, team);
      setToast(r.ok ? { tone: "ok", text: `"${c.term ?? "키워드"}" 변경을 되돌렸습니다.` } : { tone: "error", text: r.error ?? "되돌리지 못했습니다." });
    } catch {
      setToast({ tone: "error", text: "되돌리지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) return <p className="text-xs text-[var(--sos-text-hint)]">아직 변경 이력이 없습니다.</p>;

  return (
    <>
      <ul className="flex flex-col">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--sos-divider-lite)] py-3 last:border-b-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm text-[var(--sos-text)]">
                <span className="font-medium text-[var(--sos-text-strong)]">{c.term ?? "(지워진 키워드)"}</span> · {describeChange(c)}
              </p>
              <p className="sos-num text-xs font-medium text-[var(--sos-text-sub)]">
                {c.whenText} · {c.actorName ?? "알 수 없음"}
              </p>
            </div>
            <button type="button" onClick={() => void revert(c)} disabled={busyId !== null || c.term === null} className={secondaryButton}>
              {busyId === c.id ? "되돌리는 중…" : "되돌리기"}
            </button>
          </li>
        ))}
      </ul>
      <Toast message={toast} onClose={closeToast} />
    </>
  );
}
