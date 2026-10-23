"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MEMO_MAX, type EditableStatus } from "../lib/lead-input";
import { markLeadSeen, updateLead } from "../server/lead-actions";
import type { LeadDetail } from "../types";
import { secondaryButton as secondary, touchArea } from "./sos-styles";
import { Toast, type ToastMessage } from "./toast";

// 카드 버튼: [사업으로 전환](convertSlot), 담당 지정, 보류, 관심 없음, 메모 (시각 설계서 §5.1)
// 저장 성공 시 서버가 화면을 새로 그려 새 updatedAt 이 props 로 온다 (다음 저장의 비교 기준).

type Lead = Pick<LeadDetail, "id" | "status" | "assigneeId" | "memo" | "updatedAt" | "members">;

type Props = { lead: Lead; markSeen: boolean; team: string | null; convertSlot?: ReactNode };

export function LeadActions({ lead, markSeen, team, convertSlot }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // "새 진행"을 지우는 동안은 저장을 막는다 — 지우면 updatedAt 이 바뀌어 옛 값으로 저장하면 충돌이 난다
  const [marking, setMarking] = useState(markSeen);
  // markLeadSeen 이 돌려준 새 updatedAt. 서버가 새로 그린 props 가 오면 그쪽을 쓴다
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [memo, setMemo] = useState(lead.memo ?? "");
  const [memoOpen, setMemoOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [conflict, setConflict] = useState(false);
  const closeToast = useCallback(() => setToast(null), []);
  const converted = lead.status === "converted";

  // 새로 그려진 값으로 맞춘다 (렌더 중 상태 조정 — effect 를 쓰지 않는다). 메모 초안은 메모가 바뀐 때만 덮는다
  const [seen, setSeen] = useState({ updatedAt: lead.updatedAt, memo: lead.memo });
  if (seen.updatedAt !== lead.updatedAt || seen.memo !== lead.memo) {
    if (seen.memo !== lead.memo) setMemo(lead.memo ?? "");
    setSeen({ updatedAt: lead.updatedAt, memo: lead.memo });
    setSeenAt(null);
    setConflict(false);
  }
  const expectedUpdatedAt = seenAt ?? lead.updatedAt;
  const locked = busy || marking;

  useEffect(() => {
    // 서버 렌더 중에 쓰지 않고 화면이 열린 뒤에 지운다 (미리 불러오기로 표시가 지워지지 않게).
    // 언마운트 뒤의 상태 갱신은 무시되므로 따로 막지 않는다 (개발 모드 effect 두 번 실행 때 첫 결과를 버리지 않게)
    if (!markSeen) return;
    markLeadSeen(lead.id, team)
      .then((at) => at && setSeenAt(at))
      .catch(() => {})
      .finally(() => setMarking(false));
  }, [lead.id, markSeen, team]);

  async function save(patch: { status?: EditableStatus; assigneeId?: string | null; memo?: string }, done: string) {
    if (locked) return;
    setBusy(true);
    try {
      const r = await updateLead(lead.id, patch, expectedUpdatedAt, team);
      if (r.ok) setToast({ tone: "ok", text: done });
      else {
        setToast({ tone: "error", text: r.error });
        if (r.conflict) setConflict(true);
      }
    } catch {
      setToast({ tone: "error", text: "서버와 연결이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  const onHold = lead.status === "on_hold";
  const dismissed = lead.status === "dismissed";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {convertSlot}
        <label className="sr-only" htmlFor={`sos-assignee-${lead.id}`}>
          담당 지정
        </label>
        <select
          id={`sos-assignee-${lead.id}`}
          value={lead.assigneeId ?? ""}
          disabled={locked}
          onChange={(e) => save({ assigneeId: e.target.value || null }, e.target.value ? "담당자를 지정했습니다." : "담당자를 비웠습니다.")}
          // 고르기 칸은 의사요소를 못 쓰므로 터치 화면에서 높이를 44px 로
          className="h-8 pointer-coarse:h-11 rounded-[6px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] px-3 text-sm text-[var(--sos-text)] disabled:text-[var(--sos-disabled)]"
        >
          <option value="">담당 지정</option>
          {lead.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {/* 전환된 리드는 사업 쪽과 어긋나지 않게 상태 버튼을 두지 않는다 (서버도 거절한다) */}
        {!converted && (
          <>
            <button
              type="button"
              className={secondary}
              disabled={locked}
              aria-pressed={onHold}
              onClick={() => save({ status: onHold ? "reviewing" : "on_hold" }, onHold ? "보류를 풀었습니다." : "보류했습니다.")}
            >
              {onHold ? "보류 해제" : "보류"}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={locked}
              aria-pressed={dismissed}
              onClick={() =>
                save({ status: dismissed ? "reviewing" : "dismissed" }, dismissed ? "관심 없음을 풀었습니다." : "관심 없음으로 표시했습니다. 목록에서 숨겨집니다.")
              }
            >
              {dismissed ? "관심 없음 해제" : "관심 없음"}
            </button>
          </>
        )}
        <button type="button" className={secondary} aria-expanded={memoOpen} onClick={() => setMemoOpen((v) => !v)}>
          메모
        </button>
      </div>

      {memoOpen && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ memo }, "메모를 저장했습니다.");
          }}
        >
          <label className="sr-only" htmlFor={`sos-memo-${lead.id}`}>
            메모
          </label>
          <textarea
            id={`sos-memo-${lead.id}`}
            value={memo}
            maxLength={MEMO_MAX}
            rows={4}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="이 리드에 대한 메모"
            className="rounded-[4px] border border-[var(--sos-divider)] bg-[var(--sos-bg-input)] p-3 text-sm text-[var(--sos-text)] placeholder:text-[var(--sos-text-hint)]"
          />
          <div className="flex justify-end">
            <button type="submit" className={secondary} disabled={locked}>
              메모 저장
            </button>
          </div>
        </form>
      )}
      {!memoOpen && lead.memo && <p className="whitespace-pre-wrap text-sm text-[var(--sos-text-sub)]">{lead.memo}</p>}

      {conflict && (
        <p className="text-xs font-medium text-[var(--sos-yellow)]">
          다른 사람이 먼저 수정했습니다.{" "}
          <button type="button" className={`${touchArea} underline hover:text-[var(--sos-accent)]`} onClick={() => router.refresh()}>
            최신 내용 불러오기
          </button>
          {memoOpen && " (쓰던 메모는 새로 불러오면 사라집니다)"}
        </p>
      )}
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}
