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
    if (!prev.touchedAt) return { create: false, hidden: true };
    // 버린 리드의 숨김은 건드리지 않는다
    return prev.status === "dismissed"
      ? { create: false, keywordMismatch: true }
      : { create: false, keywordMismatch: true, hidden: false };
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
    // DB 는 "+00:00", 초안은 "Z" — 문자열이 아니라 시각으로 비교
    const t = (v: string | null) => (v === null ? null : Date.parse(v));
    const deadlineChanged = t(draft.nextDeadlineAt) !== t(prev.nextDeadlineAt);
    if (advanced || deadlineChanged) out.hasNewProgress = true;
  }
  return out;
}
