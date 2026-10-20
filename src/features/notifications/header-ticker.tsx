import "server-only";

import { requireUser } from "@/shared/auth/current-user";
import { getMyDeals } from "@/features/deals/queries";
import { todayInSeoul } from "@/features/deals/status";
import { buildNotifications } from "./build";
import { Ticker } from "./ticker";

// 헤더 가운데 '주요 알림' — 내 사업 기준 (설계서 §7.1 범위: 내 보기)
export async function HeaderTicker() {
  const user = await requireUser();
  const deals = await getMyDeals(user.id);
  return <Ticker items={buildNotifications(deals, todayInSeoul())} />;
}
