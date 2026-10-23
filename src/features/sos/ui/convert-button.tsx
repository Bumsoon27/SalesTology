"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { dealHref, orderMonthOf, toLeadToDealInput } from "../convert";
import { formatOrderMonth } from "../lib/lead-view";
import { convertLead, unlinkDeletedDeal } from "../server/convert-action";
import { formatWon } from "../summary/template";
import type { LeadDetail } from "../types";
import { secondaryButton, touchArea } from "./sos-styles";
import { Toast, type ToastMessage } from "./toast";

// [사업으로 전환] (설계서 §6.1): 확인 창에서 A 로 넘길 값을 보여 주고 저장한다.
// 관리자 보기는 create_deal 을 부를 수 없어 버튼을 끈다. 이미 전환됐으면 대시보드 링크만.
const primary =
  "relative h-8 rounded-[6px] bg-[var(--sos-text-strong)] px-3 text-sm font-semibold text-[var(--sos-text-on-primary)] transition-colors duration-200 disabled:cursor-not-allowed disabled:bg-[var(--sos-disabled)] " +
  "before:absolute before:-inset-x-0 before:-inset-y-1.5 before:content-['']";
const linkStyle = `${touchArea} text-sm font-medium text-[var(--sos-green)] underline-offset-2 transition-colors duration-200 hover:text-[var(--sos-accent)] hover:underline`;
const ADMIN_REASON = "관리자 보기에서는 사업으로 전환할 수 없습니다. 부문 담당자가 전환해 주세요.";

type Lead = Pick<
  LeadDetail,
  | "id"
  | "title"
  | "orgName"
  | "companyId"
  | "budget"
  | "expectedOrderMonth"
  | "stage"
  | "status"
  | "assigneeId"
  | "convertedDealId"
  | "convertedDealMissing"
  | "members"
>;

export function ConvertButton({ lead, team, adminView }: { lead: Lead; team: string | null; adminView: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [href, setHref] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const reasonId = useId();
  const cancel = useCallback(() => setOpen(false), []);

  async function unlink() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await unlinkDeletedDeal(lead.id, team);
      setToast(r.ok ? { tone: "ok", text: "연결을 해제했습니다. 리드는 검토 중으로 돌아갑니다." } : { tone: "error", text: r.error });
    } catch {
      setToast({ tone: "error", text: "서버와 연결이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  // 연결된 사업이 A 에서 삭제됨 — 연결을 끊어야 다시 편집할 수 있다
  if (lead.convertedDealMissing && !href) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-[var(--sos-yellow)]">연결된 사업이 삭제되었습니다.</span>
        <button type="button" className={secondaryButton} disabled={busy} onClick={unlink}>
          연결 해제
        </button>
        <Toast message={toast} onClose={closeToast} />
      </span>
    );
  }

  const doneHref = href ?? (lead.status === "converted" && lead.convertedDealId ? dealHref(lead.convertedDealId) : null);
  if (doneHref) {
    // 성공 토스트가 링크로 바뀌면서 사라지지 않게 함께 그린다
    return (
      <>
        <Link href={doneHref} className={linkStyle}>
          대시보드에서 보기 →
        </Link>
        <Toast message={toast} onClose={closeToast} />
      </>
    );
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await convertLead(lead.id, team);
      if (r.ok) {
        setHref(r.href);
        setOpen(false);
        setToast({ tone: "ok", text: "사업으로 전환했습니다." });
      } else setToast({ tone: "error", text: r.error });
    } catch {
      setToast({ tone: "error", text: "서버와 연결이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {adminView ? (
        // 꺼진 버튼은 마우스 이벤트를 받지 않으므로 감싼 요소에 이유를 단다
        <span title={ADMIN_REASON} className="inline-flex">
          <button type="button" className={primary} disabled aria-describedby={reasonId}>
            사업으로 전환
          </button>
          <span id={reasonId} className="sr-only">
            {ADMIN_REASON}
          </span>
        </span>
      ) : (
        <button type="button" className={primary} disabled={busy} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          사업으로 전환
        </button>
      )}
      {open && <ConfirmDialog lead={lead} busy={busy} onCancel={cancel} onConfirm={submit} />}
      <Toast message={toast} onClose={closeToast} />
    </>
  );
}

function ConfirmDialog({ lead, busy, onCancel, onConfirm }: { lead: Lead; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  // 서버 액션과 같은 변환 함수로 미리 보여 준다
  const input = toLeadToDealInput({
    id: lead.id,
    title: lead.title,
    orgName: lead.orgName,
    companyId: lead.companyId,
    budget: lead.budget,
    orderMonth: orderMonthOf(lead.expectedOrderMonth),
    stage: lead.stage,
    assigneeId: lead.assigneeId,
  });
  const owner = input.ownerId ? (lead.members.find((m) => m.id === input.ownerId)?.name ?? "알 수 없음") : "나 (담당자 미지정)";
  const rows: [string, string][] = [
    ["사업명", input.name],
    ["고객사", `${input.customer || "—"}${input.customerId ? " (기존 고객)" : ""}`],
    ["예산", formatWon(lead.budget)],
    ["발주 시기", formatOrderMonth(input.orderMonth ?? null)],
    ["조달 방식", "경쟁입찰"],
    ["담당 영업대표", owner],
  ];

  // 처음 열 때 한 번만 초점을 옮긴다 (다시 그려질 때마다 초점을 빼앗지 않게)
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);
  // 최신 busy·onCancel 은 ref 로 읽어 키 처리기를 한 번만 단다
  const latest = useRef({ busy, onCancel });
  useEffect(() => {
    latest.current = { busy, onCancel };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !latest.current.busy && latest.current.onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[420px] flex-col gap-4 rounded-[6px] bg-[var(--sos-bg-modal)] p-5 text-sm text-[var(--sos-text)] shadow-[0_0_16px_rgba(0,0,0,0.2)]"
      >
        <h2 id={titleId} className="text-base font-semibold text-[var(--sos-text-strong)]">
          사업으로 전환
        </h2>
        <p className="text-xs font-medium text-[var(--sos-text-sub)]">아래 값으로 SalesTology 대시보드에 사업을 만듭니다.</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs font-medium text-[var(--sos-text-sub)]">{k}</dt>
              <dd className="break-words text-[var(--sos-text-strong)]">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} disabled={busy} onClick={onCancel}>
            취소
          </button>
          <button ref={confirmRef} type="button" className={primary} disabled={busy} onClick={onConfirm}>
            {busy ? "전환 중…" : "전환"}
          </button>
        </div>
      </div>
    </div>
  );
}
