import Link from "next/link";
import type { ReactNode } from "react";
import type { LeadDetail as LeadDetailData } from "../types";
import { DetailEffects } from "./detail-effects";
import { LeadCard } from "./lead-card";

// 리드 상세 패널 — 넓은 화면은 목록 오른쪽, 좁은 화면은 목록 위 (시각 설계서 §6). ?lead=<id> 로 연다
type Props = {
  lead: LeadDetailData | null;
  today: string;
  team: string | null;
  closeHref: string;
  convertSlot?: ReactNode;
};

export function LeadDetailPanel({ lead, today, team, closeHref, convertSlot }: Props) {
  return (
    <aside aria-label="리드 상세" className="flex scroll-mt-4 flex-col gap-3 min-[1000px]:sticky min-[1000px]:top-4 min-[1000px]:self-start">
      <div className="flex justify-end">
        <Link href={closeHref} scroll={false} className="text-xs font-medium text-[var(--sos-text-sub)] transition-colors duration-200 hover:text-[var(--sos-accent)]">
          닫기 ✕
        </Link>
      </div>
      {lead ? (
        <>
          <DetailEffects leadId={lead.id} markSeen={lead.status === "on_hold" && lead.hasNewProgress} team={team} />
          <LeadCard lead={lead} today={today} team={team} convertSlot={convertSlot} />
        </>
      ) : (
        <p className="rounded-[6px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] p-5 text-sm text-[var(--sos-text-sub)]">
          리드를 찾을 수 없습니다. 다른 부문의 리드이거나 정리된 리드일 수 있습니다.
        </p>
      )}
    </aside>
  );
}
