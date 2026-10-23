"use client";

import { useEffect, useRef } from "react";

// 상세를 열 때 한 번: 좁은 화면이면 상세로 스크롤한다. ("새 진행" 지우기는 LeadActions 가 한다 — 새 updatedAt 을 받아야 해서)
const WIDE = "(min-width: 1000px)";

export function DetailEffects({ leadId }: { leadId: string }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!window.matchMedia(WIDE).matches) anchor.current?.closest("aside")?.scrollIntoView({ block: "start" });
  }, [leadId]);

  return <span ref={anchor} hidden />;
}
