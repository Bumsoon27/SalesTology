"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { TIER_LABEL } from "../lib/keyword-edit";
import { addKeywords, deleteKeyword } from "../server/settings-actions";
import type { SettingsKeyword, SettingsProduct } from "../server/settings-queries";
import type { Tier } from "../types";
import { KeywordPopover } from "./keyword-popover";
import { inputField, sectionTitle } from "./sos-styles";
import { Toast, type ToastMessage } from "./toast";

// 핵심·확장·제외 칩 (시각 설계서 §5.4). 입력창 Enter 로 쉼표·줄바꿈 일괄 추가, 칩 ✕ 로 삭제, 칩을 누르면 설정 창
const TIERS: Tier[] = ["core", "extended", "exclude"];

const CHIP: Record<Tier, string> = {
  core: "bg-[var(--sos-text-strong)] text-[var(--sos-text-on-primary)]",
  extended: "border border-[var(--sos-divider)] text-[var(--sos-text-sub)]",
  exclude: "bg-[var(--sos-red-bg)] text-[var(--sos-red)]",
};

export function KeywordChips({ keywords, products, team }: { keywords: SettingsKeyword[]; products: SettingsProduct[]; team: string | null }) {
  const [input, setInput] = useState("");
  const [tier, setTier] = useState<Tier>("core");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const closePopover = useCallback(() => setOpenId(null), []);

  async function submit() {
    if (busy || input.trim() === "") return;
    setBusy(true);
    try {
      const r = await addKeywords(input, tier, team);
      if (r.ok) {
        setInput("");
        setToast({ tone: r.notice ? "error" : "ok", text: r.notice ? `${r.added}개 추가. ${r.notice}` : `${r.added}개를 추가했습니다. [재분석] 후 리드에 반영됩니다.` });
      } else {
        // 모두 이미 있던 키워드면 입력은 지운다
        if ((r.added ?? 0) > 0 || r.error?.startsWith("이미 있는 키워드")) setInput("");
        setToast({ tone: "error", text: r.notice && r.error !== r.notice ? `${r.error} ${r.notice}` : (r.error ?? "추가하지 못했습니다.") });
      }
    } catch {
      setToast({ tone: "error", text: "추가하지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중 Enter 는 글자 확정이다
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  async function remove(k: SettingsKeyword) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await deleteKeyword(k.id, team);
      setToast(r.ok ? { tone: "ok", text: `"${k.term}"을(를) 삭제했습니다. 변경 이력에서 되돌릴 수 있습니다.` } : { tone: "error", text: r.error ?? "삭제하지 못했습니다." });
      if (r.ok && openId === k.id) setOpenId(null);
    } catch {
      setToast({ tone: "error", text: "삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <label htmlFor="sos-kw-input" className="sr-only">
          키워드
        </label>
        <input
          id="sos-kw-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
          placeholder="키워드 입력 후 Enter (쉼표로 여러 개)"
          className={`${inputField} min-w-0 flex-1`}
        />
        <label htmlFor="sos-kw-tier" className="sr-only">
          칸
        </label>
        <select id="sos-kw-tier" value={tier} onChange={(e) => setTier(e.target.value as Tier)} className={`${inputField} w-24`}>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {TIERS.map((t) => {
        const list = keywords.filter((k) => k.tier === t);
        return (
          <section key={t} className="flex flex-col gap-3" aria-labelledby={`sos-tier-${t}`}>
            <h3 id={`sos-tier-${t}`} className={sectionTitle}>
              {TIER_LABEL[t]} <span className="sos-num text-xs font-medium text-[var(--sos-text-sub)]">{list.length}</span>
            </h3>
            {list.length === 0 ? (
              <p className="text-xs text-[var(--sos-text-hint)]">아직 없습니다.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {list.map((k) => (
                  <li key={k.id} className="relative">
                    <span
                      className={`inline-flex h-8 items-center rounded-[6px] text-sm font-medium ${CHIP[k.tier]} ${
                        k.active ? "" : "text-[var(--sos-text-hint)]!"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenId(openId === k.id ? null : k.id)}
                        aria-expanded={openId === k.id}
                        aria-haspopup="dialog"
                        className="relative h-full pr-1.5 pl-3 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
                      >
                        {k.term}
                        {k.weight !== null && <span className="sos-num ml-1 text-xs opacity-70">×{k.weight}</span>}
                        {!k.active && <span className="ml-1 text-xs">(꺼짐)</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(k)}
                        disabled={busy}
                        aria-label={`${k.term} 삭제`}
                        className="relative h-full pr-3 pl-1 opacity-70 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] hover:opacity-100 disabled:cursor-not-allowed"
                      >
                        ✕
                      </button>
                    </span>
                    {openId === k.id && (
                      <KeywordPopover
                        keyword={k}
                        products={products}
                        team={team}
                        onClose={closePopover}
                        onMessage={setToast}
                        onDelete={() => void remove(k)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}
