"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ALERT_DAYS, SUMMARY_TOP_N } from "../lib/keyword-edit";
import { updateTeamSettings } from "../server/settings-actions";
import { secondaryButton, smallField } from "./sos-styles";
import { Toast, type ToastMessage } from "./toast";

// 부문 설정: 사전규격 의견 마감 알림 D-n, AI 요약 건수 (설계서 §5.4)
export function TeamSettingsForm({ settings, team }: { settings: { prespecAlertDays: number; aiSummaryTopN: number }; team: string | null }) {
  const [days, setDays] = useState(String(settings.prespecAlertDays));
  const [topN, setTopN] = useState(String(settings.aiSummaryTopN));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      // 숫자가 아니면 NaN 이 가고 서버 검증이 거절 문구를 돌려준다
      const r = await updateTeamSettings({ prespecAlertDays: Number(days), aiSummaryTopN: Number(topN) }, team);
      setToast(r.ok ? { tone: "ok", text: "부문 설정을 저장했습니다." } : { tone: "error", text: r.error ?? "저장하지 못했습니다." });
    } catch {
      setToast({ tone: "error", text: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--sos-text)]">
          사전규격 의견 마감 알림{" "}
          <span className="text-xs text-[var(--sos-text-sub)]">
            (D-{ALERT_DAYS.min}~D-{ALERT_DAYS.max})
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm text-[var(--sos-text-sub)]">
          D-
          <input
            type="number"
            inputMode="numeric"
            min={ALERT_DAYS.min}
            max={ALERT_DAYS.max}
            step={1}
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className={`${smallField} sos-num w-20`}
          />
        </span>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--sos-text)]">
          AI 요약 건수{" "}
          <span className="text-xs text-[var(--sos-text-sub)]">
            (점수 상위 {SUMMARY_TOP_N.min}~{SUMMARY_TOP_N.max}건)
          </span>
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={SUMMARY_TOP_N.min}
          max={SUMMARY_TOP_N.max}
          step={1}
          required
          value={topN}
          onChange={(e) => setTopN(e.target.value)}
          className={`${smallField} sos-num w-20`}
        />
      </label>
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className={secondaryButton}>
          {busy ? "저장 중…" : "설정 저장"}
        </button>
      </div>
      <Toast message={toast} onClose={closeToast} />
    </form>
  );
}
