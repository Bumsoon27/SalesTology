"use client";

import { useEffect, useRef, useState } from "react";
import { W } from "../analysis/score";
import { TIER_LABEL, WEIGHT_MAX } from "../lib/keyword-edit";
import { updateKeyword } from "../server/settings-actions";
import type { SettingsKeyword, SettingsProduct } from "../server/settings-queries";
import type { Tier } from "../types";
import { dangerButton, secondaryButton, smallField } from "./sos-styles";
import type { ToastMessage } from "./toast";

// 칩 설정 창 (설계서 §5.4): 칸·가중치·켜기/끄기·연결 제품. 적용 출처는 S1 에 조달 하나뿐이라 두지 않는다
const TIERS: Tier[] = ["core", "extended", "exclude"];

export function KeywordPopover({
  keyword,
  products,
  team,
  onClose,
  onMessage,
  onDelete,
}: {
  keyword: SettingsKeyword;
  products: SettingsProduct[];
  team: string | null;
  onClose: () => void;
  onMessage: (m: ToastMessage) => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tier, setTier] = useState<Tier>(keyword.tier);
  const [weight, setWeight] = useState(keyword.weight === null ? "" : String(keyword.weight));
  const [active, setActive] = useState(keyword.active);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(keyword.productIds));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Esc·바깥 누르면 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      // 칩 버튼(같은 li)을 누른 것은 칩이 직접 열고 닫는다
      if (el && !el.parentElement?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  async function save() {
    if (busy) return;
    const w = weight.trim() === "" ? null : Number(weight);
    if (w !== null && (!Number.isInteger(w) || w < 0 || w > WEIGHT_MAX)) {
      onMessage({ tone: "error", text: `가중치는 0~${WEIGHT_MAX} 사이 정수로 넣어 주세요. 비우면 칸 기본값입니다.` });
      return;
    }
    setBusy(true);
    try {
      const r = await updateKeyword(keyword.id, { tier, weight: w, active, productIds: [...picked] }, team);
      if (r.ok) {
        onMessage({ tone: "ok", text: `"${keyword.term}" 설정을 저장했습니다. [재분석] 후 리드에 반영됩니다.` });
        onClose();
      } else onMessage({ tone: "error", text: r.error ?? "저장하지 못했습니다." });
    } catch {
      onMessage({ tone: "error", text: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const defaultWeight = tier === "core" ? W.core : tier === "extended" ? W.extended : null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${keyword.term} 설정`}
      // 넓은 화면은 칩 아래, 좁은 화면(<1000px)은 칩이 오른쪽 끝에 있어도 넘치지 않게 아래 시트로 띄운다
      className="fixed inset-x-4 bottom-4 z-40 flex max-h-[80vh] flex-col gap-4 overflow-y-auto rounded-[6px] bg-[var(--sos-bg-modal)] p-4 text-sm text-[var(--sos-text)] shadow-[0_0_16px_rgba(0,0,0,0.2)] min-[1000px]:absolute min-[1000px]:inset-x-auto min-[1000px]:top-full min-[1000px]:bottom-auto min-[1000px]:left-0 min-[1000px]:mt-2 min-[1000px]:max-h-none min-[1000px]:w-80 min-[1000px]:overflow-visible"
    >
      <p className="text-base font-semibold text-[var(--sos-text-strong)]">{keyword.term}</p>

      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--sos-text-sub)]">칸</span>
        <select value={tier} onChange={(e) => setTier(e.target.value as Tier)} className={smallField}>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--sos-text-sub)]">가중치 (0~{WEIGHT_MAX})</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={WEIGHT_MAX}
          step={1}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          disabled={tier === "exclude"}
          placeholder={defaultWeight === null ? "—" : `기본 ${defaultWeight}`}
          className={`${smallField} sos-num w-24`}
        />
      </label>

      <label className="flex items-center justify-between gap-3 pointer-coarse:min-h-11">
        <span className="text-xs font-medium text-[var(--sos-text-sub)]">켜기</span>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--sos-text-strong)]" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-[var(--sos-text-sub)]">연결 제품</legend>
        {products.length === 0 ? (
          <p className="text-xs text-[var(--sos-text-hint)]">제품 목록에서 먼저 제품을 추가해 주세요.</p>
        ) : (
          <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
            {products.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 pointer-coarse:min-h-11">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[var(--sos-text-strong)]" />
                  <span>{p.name}</span>
                  {p.vendor && <span className="text-xs text-[var(--sos-text-hint)]">{p.vendor}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {confirmDelete ? (
          <span className="flex items-center gap-2">
            <button type="button" onClick={onDelete} disabled={busy} className={dangerButton}>
              삭제 확인
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className={secondaryButton}>
              취소
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className={dangerButton}>
            삭제
          </button>
        )}
        <span className="flex items-center gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            닫기
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} className={secondaryButton}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </span>
      </div>
    </div>
  );
}
