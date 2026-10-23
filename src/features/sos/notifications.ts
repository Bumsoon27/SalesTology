// 사전규격 의견 마감 임박 알림 (설계서 §6.2). 순수 함수 — 조회는 notification-provider.ts.
import type { ExternalNotification, NotificationContext } from "@/shared/notifications/providers";
import { displayOrgName } from "./analysis/org";
import { daysUntil } from "./lib/date";
import { formatWon } from "./summary/template";

export type PrespecLead = {
  id: string;
  orgName: string;
  title: string;
  budget: number | null;
  nextDeadlineAt: string;
  assigneeId: string | null;
};

/** 의견 마감 D-alertDays ~ D-0 (경계 포함). view "mine" 은 내 담당 리드만 */
export function buildPrespecNotifications(leads: PrespecLead[], ctx: NotificationContext, alertDays: number): ExternalNotification[] {
  const out: ExternalNotification[] = [];
  for (const l of leads) {
    if (ctx.view === "mine" && l.assigneeId !== ctx.userId) continue;
    const n = daysUntil(l.nextDeadlineAt, ctx.today);
    if (!Number.isFinite(n) || n < 0 || n > alertDays) continue;
    const org = displayOrgName(l.orgName);
    out.push({
      key: `sos:prespec_deadline:${l.id}:${ctx.today}`,
      // 앞에 [SOS] 는 붙이지 않는다 — source 가 배지로 붙는다
      text: `${org ? `${org} · ` : ""}${l.title} — 사전규격 의견 마감 D-${n} (예산 ${formatWon(l.budget)})`,
      urgency: 70 - n,
      href: `/sos?lead=${encodeURIComponent(l.id)}`,
      source: "SOS",
    });
  }
  return out;
}
