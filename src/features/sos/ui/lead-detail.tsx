import Link from "next/link";
import type { ReactNode } from "react";
import type { LeadDetail as LeadDetailData } from "../types";
import { DetailEffects } from "./detail-effects";
import { touchArea } from "./sos-styles";
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
  // 넓은 화면: 목록 옆에 고정(sticky)되므로 패널이 화면보다 길면 아랫부분에 닿지 못한다 —
  // 높이를 SOS 스크롤 영역(화면 − 상단 바 3rem − 위아래 여백 2rem) 안으로 묶고 패널 안에서 따로 스크롤한다
  return (
    <aside
      aria-label="리드 상세"
      className="flex scroll-mt-4 flex-col gap-3 min-[1000px]:sticky min-[1000px]:top-4 min-[1000px]:max-h-[calc(100dvh-5rem)] min-[1000px]:self-start min-[1000px]:overflow-y-auto min-[1000px]:overscroll-contain"
    >
      <div className="flex justify-end">
        <Link href={closeHref} scroll={false} className={`${touchArea} text-xs font-medium text-[var(--sos-text-sub)] transition-colors duration-200 hover:text-[var(--sos-accent)]`}>
          닫기 ✕
        </Link>
      </div>
      {lead ? (
        <>
          <DetailEffects leadId={lead.id} />
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
