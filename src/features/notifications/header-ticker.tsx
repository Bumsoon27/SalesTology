import "server-only";

import { requireUser } from "@/shared/auth/current-user";
import { loadExternalNotifications } from "@/shared/notifications/providers";
import { getMyDeals } from "@/features/deals/queries";
import { todayInSeoul } from "@/features/deals/status";
import { buildNotifications, type AppNotification } from "./build";
import { Ticker } from "./ticker";

// 헤더 가운데 '주요 알림' — 내 사업 알림 + 다른 영역(B 등) 공급자 알림 (설계서 §7.1, §11.2)
export async function HeaderTicker() {
  const user = await requireUser();
  const today = todayInSeoul();
  const [deals, external] = await Promise.all([
    getMyDeals(user.id),
    loadExternalNotifications({ userId: user.id, teamId: user.teamId, today }),
  ]);
  const items: AppNotification[] = [
    ...buildNotifications(deals, today),
    ...external.map((n) => ({ key: n.key, kind: "external" as const, text: n.text, urgency: n.urgency, href: n.href, source: n.source })),
  ].sort((a, b) => b.urgency - a.urgency);
  return <Ticker items={items} />;
}
