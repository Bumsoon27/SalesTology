"use client";

// 다른 사람이 사업·업무·이슈를 바꾸면 새로고침 없이 화면을 다시 그린다 (설계서 §7.4)
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/shared/supabase/client";

const TABLES = ["deals", "deal_tasks", "issues", "deal_parties", "companies"] as const;

export function RealtimeRefresh() {
  const router = useRouter();
  const [connected, setConnected] = useState(true);
  const wasDown = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 연달아 바뀌어도 한 번만 다시 그리게 모은다
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase.channel("salestology-core");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe((status) => {
      const up = status === "SUBSCRIBED";
      setConnected(up);
      // 끊겼다가 다시 연결되면 놓친 변경이 있을 수 있으니 전체를 다시 불러온다
      if (up && wasDown.current) refresh();
      wasDown.current = !up;
    });
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  if (connected) return null;
  return <span className="rounded-full border border-st-yellow/40 px-3 py-1 text-xs text-st-yellow">실시간 연결 끊김 — 재연결 중</span>;
}
