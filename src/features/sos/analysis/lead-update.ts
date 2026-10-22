import { STAGE_RANK, type LeadStatus, type Stage } from "../types";
import type { LeadDraft } from "./chain";

export type StoredLead = {
  status: LeadStatus;
  stage: Stage;
  nextDeadlineAt: string | null;
  touchedAt: string | null;
  hidden: boolean;
  hasNewProgress: boolean;
  keywordMismatch: boolean;
};

export type LeadUpdate = Partial<StoredLead> & { create: boolean };

/** 재분석 결과를 저장된 리드에 반영하는 규칙(설계서 §3.3-4). status 는 신규일 때만 돌려준다. */
export function applyLeadUpdate(
  prev: StoredLead | null,
  next: { draft: LeadDraft | null; matched: boolean },
): LeadUpdate {
  const { draft, matched } = next;
  if (!prev) {
    if (!matched || !draft) return { create: false };
    return {
      create: true,
      status: "new",
      stage: draft.stage,
      nextDeadlineAt: draft.nextDeadlineAt,
      hidden: false,
      hasNewProgress: false,
      keywordMismatch: false,
    };
  }

  if (!matched || !draft) {
    // 손댄 적 없으면 조용히 숨기고, 손댄 리드는 지우지 않고 표시만 한다
    return prev.touchedAt
      ? { create: false, keywordMismatch: true, hidden: false }
      : { create: false, hidden: true };
  }

  const out: LeadUpdate = {
    create: false,
    stage: draft.stage,
    nextDeadlineAt: draft.nextDeadlineAt,
    // 버린 리드는 다시 맞아도 되살리지 않는다
    hidden: prev.status === "dismissed" ? prev.hidden : false,
    keywordMismatch: false,
  };
  if (prev.status === "on_hold") {
    const advanced = STAGE_RANK[draft.stage] > STAGE_RANK[prev.stage];
    const deadlineChanged = draft.nextDeadlineAt !== prev.nextDeadlineAt;
    if (advanced || deadlineChanged) out.hasNewProgress = true;
  }
  return out;
}
