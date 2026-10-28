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
import { tokenCheck } from "@/features/admin/system-status";

/** 헤더 알림 — 내 사업 알림 + 다른 영역(B 등) 공급자 알림. 티커와 종이 한 요청에서 같이 쓴다 (React cache) */
const loadHeaderNotifications = cache(async (): Promise<AppNotification[]> => {
  const user = await requireUser();
  const today = todayInSeoul();
  const [deals, external, system] = await Promise.all([
    getMyDeals(user.id),
    loadExternalNotifications({ userId: user.id, teamId: user.teamId, today, view: "mine" }),
    user.role === "admin" ? systemAlerts(today) : Promise.resolve([]),
  ]);
  return [
    ...system,
    ...buildNotifications(deals, today),
    ...external.map((n) => ({ key: n.key, kind: "external" as const, text: n.text, urgency: n.urgency, href: n.href, source: n.source })),
  ].sort((a, b) => b.urgency - a.urgency);
});

/** 관리자에게만: DB 자동 반영이 뒤처졌거나 Supabase 토큰 만료가 다가오면 상단 알림 (관리자 화면으로 이동) */
async function systemAlerts(today: string): Promise<AppNotification[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_system_status");
  const s = (data ?? {}) as { latest_migration?: string | null; supabase_token_expires_on?: string | null };
  const out: AppNotification[] = [];
  const build = process.env.BUILD_LATEST_MIGRATION ?? "";
  if (build && s.latest_migration && s.latest_migration < build) {
    out.push({ key: `system_migration:${build}:${today}`, kind: "external", source: "시스템", href: "/admin", urgency: 95, text: "DB 자동 반영이 멈췄습니다 — 운영 DB 가 코드보다 뒤처져 있습니다" });
  }
  const t = tokenCheck(s.supabase_token_expires_on ?? null, today);
  if (s.supabase_token_expires_on && t.state !== "ok") {
    out.push({ key: `system_token:${s.supabase_token_expires_on}:${today}`, kind: "external", source: "시스템", href: "/admin", urgency: t.state === "error" ? 95 : 80, text: `Supabase 토큰 — ${t.detail}` });
  }
  return out;
}

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
