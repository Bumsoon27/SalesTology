import "server-only";

import { cache } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { createClient } from "@/shared/supabase/server";
import { loadExternalNotifications } from "@/shared/notifications/providers";
import { getMyDeals } from "@/features/deals/queries";
import { todayInSeoul } from "@/features/deals/status";
import { buildNotifications, type AppNotification } from "./build";
import { Ticker } from "./ticker";
import { Bell } from "./bell";

/** 헤더 알림 — 내 사업 알림 + 다른 영역(B 등) 공급자 알림. 티커와 종이 한 요청에서 같이 쓴다 (React cache) */
const loadHeaderNotifications = cache(async (): Promise<AppNotification[]> => {
  const user = await requireUser();
  const today = todayInSeoul();
  const [deals, external] = await Promise.all([
    getMyDeals(user.id),
    loadExternalNotifications({ userId: user.id, teamId: user.teamId, today, view: "mine" }),
  ]);
  return [
    ...buildNotifications(deals, today),
    ...external.map((n) => ({ key: n.key, kind: "external" as const, text: n.text, urgency: n.urgency, href: n.href, source: n.source })),
  ].sort((a, b) => b.urgency - a.urgency);
});

// 헤더 가운데 '주요 알림' 티커 (설계서 §7.1, §11.2)
export async function HeaderTicker() {
  return <Ticker items={await loadHeaderNotifications()} />;
}

// 헤더 오른쪽 알림 종 — 전체 목록·읽음 처리 (읽음은 notification_reads, 본인 것만 RLS)
export async function HeaderBell() {
  const items = await loadHeaderNotifications();
  const supabase = await createClient();
  const keys = items.map((i) => i.key);
  const read = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await supabase.from("notification_reads").select("notification_key").in("notification_key", keys.slice(i, i + 100));
    for (const r of data ?? []) read.add(r.notification_key as string);
  }
  return <Bell items={items} readKeys={[...read]} />;
}
