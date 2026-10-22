"use client";

import { useEffect, useRef } from "react";
import { markLeadSeen } from "../server/lead-actions";

// 상세를 열 때 한 번: 보류 리드의 "새 진행" 표시를 지우고, 좁은 화면이면 상세로 스크롤한다
const WIDE = "(min-width: 1000px)";

export function DetailEffects({ leadId, markSeen, team }: { leadId: string; markSeen: boolean; team: string | null }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!window.matchMedia(WIDE).matches) anchor.current?.closest("aside")?.scrollIntoView({ block: "start" });
  }, [leadId]);

  useEffect(() => {
    // 서버 렌더 중에 쓰지 않고 화면이 열린 뒤에 지운다 (미리 불러오기로 표시가 지워지지 않게)
    if (markSeen) void markLeadSeen(leadId, team).catch(() => {});
  }, [leadId, markSeen, team]);

  return <span ref={anchor} hidden />;
}
