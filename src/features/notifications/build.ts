// 알림 생성 (설계서 §7.1). 데이터에서 계산하며 저장하지 않는다. 순수 함수.
import { RENEWAL_NOTICE_DAYS, YELLOW_WINDOW_DAYS } from "@/shared/config/status";
import { computeTaskState, daysUntil } from "@/features/deals/status";
import { TASK_LABEL, type DealRow, type DealStage } from "@/features/deals/types";

export type NotificationKind = "issue" | "task_overdue" | "missing_schedule" | "task_soon" | "renewal_soon" | "external";

export type AppNotification = {
  key: string; // {종류}:{대상 id}:{기준일}
  kind: NotificationKind;
  /** A 사업 알림일 때만 */
  dealId?: string;
  text: string;
  urgency: number;
  /** 클릭 시 이동할 앱 내부 주소 */
  href: string;
  /** 다른 영역(B 등)에서 온 알림의 출처 표시 */
  source?: string;
};

const focusHref = (dealId: string) => `/dashboard?focus=d:${dealId}`;

type NotifiableDeal = Pick<DealRow, "id" | "name" | "status" | "stage" | "customer" | "deal_tasks" | "issues"> & {
  period_end?: string | null;
};

const WON_OR_LATER: DealStage[] = ["won", "fulfillment", "billing"];

export function buildNotifications(deals: NotifiableDeal[], today: string): AppNotification[] {
  const out: AppNotification[] = [];
  for (const d of deals) {
    const head = `${d.customer.name} · ${d.name}`;

    // 계약 종료 임박은 종결 사업도 포함 (갱신 확인)
    if (d.period_end && (d.status === "active" || d.status === "closed")) {
      const left = daysUntil(d.period_end, today);
      if (left >= 0 && left <= RENEWAL_NOTICE_DAYS) {
        out.push({ key: `renewal_soon:${d.id}:${today}`, kind: "renewal_soon", dealId: d.id, href: focusHref(d.id), text: `${head} — 계약 종료 D-${left}, 갱신 확인`, urgency: 55 - left / 2 });
      }
    }
    if (d.status !== "active") continue;

    for (const i of d.issues.filter((x) => x.status === "open")) {
      out.push({ key: `issue:${i.id}:${today}`, kind: "issue", dealId: d.id, href: focusHref(d.id), text: `${head} — 이슈 '${i.title}' 미해결`, urgency: 100 });
    }

    for (const t of d.deal_tasks) {
      if (computeTaskState(t) !== "open" || !t.due_date) continue;
      const left = daysUntil(t.due_date, today);
      const name = t.type === "custom" ? (t.title ?? "업무") : TASK_LABEL[t.type];
      if (left < 0) {
        const isInvoice = t.type === "invoice_out";
        out.push({
          key: `task_overdue:${t.id}:${today}`,
          kind: "task_overdue",
          dealId: d.id,
          href: focusHref(d.id),
          text: `${head} — ${isInvoice ? "계산서 발행 필수" : name} (${-left}일 지남)`,
          urgency: isInvoice ? 90 : 85,
        });
      } else if (left <= YELLOW_WINDOW_DAYS) {
        out.push({ key: `task_soon:${t.id}:${today}`, kind: "task_soon", dealId: d.id, href: focusHref(d.id), text: `${head} — ${name} ${left === 0 ? "오늘" : `D-${left}`}`, urgency: 70 - left });
      }
    }

    if (WON_OR_LATER.includes(d.stage)) {
      for (const type of ["delivery", "invoice_out"] as const) {
        const ofType = d.deal_tasks.filter((t) => t.type === type);
        if (ofType.length === 0 || ofType.some((t) => computeTaskState(t) === "open" && !t.due_date)) {
          out.push({ key: `missing_schedule:${d.id}-${type}:${today}`, kind: "missing_schedule", dealId: d.id, href: focusHref(d.id), text: `${head} — ${type === "delivery" ? "납품" : "계산서"} 일정 미등록`, urgency: 60 });
        }
      }
    }
  }
  return out.sort((a, b) => b.urgency - a.urgency);
}

/** 티커 순서: 긴급도 가중 무작위, 직전 3개 제외 (§7.2) */
export function pickNext(items: AppNotification[], recent: string[], rand = Math.random): AppNotification | null {
  const pool = items.length > 3 ? items.filter((n) => !recent.slice(-3).includes(n.key)) : items.filter((n) => n.key !== recent.at(-1));
  const candidates = pool.length ? pool : items;
  if (!candidates.length) return null;
  const total = candidates.reduce((s, n) => s + Math.max(1, n.urgency), 0);
  let r = rand() * total;
  for (const n of candidates) {
    r -= Math.max(1, n.urgency);
    if (r <= 0) return n;
  }
  return candidates[candidates.length - 1];
}
