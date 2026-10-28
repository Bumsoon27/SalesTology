// 주간 브리핑 알림 — 월·화요일에 '이번 주 브리핑' 한 줄을 알림 종에 띄운다 (메일 대신). 순수 함수 (테스트: weekly.test.ts)
// 읽음 처리하면 그 주에는 다시 안 뜬다 (key 에 그 주 월요일)
import { collectTodos } from "@/features/deals/todo";
import type { DealRow } from "@/features/deals/types";
import { weeks } from "@/features/reports/weekly";
import type { AppNotification } from "./build";

export function weeklyBriefNotification(deals: DealRow[], today: string): AppNotification | null {
  const { thisWeek } = weeks(today);
  // 월요일(0)·화요일(1)에만
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  if (dow > 1) return null;
  const active = deals.filter((d) => d.status === "active").length;
  const t = collectTodos(deals, today);
  const urgent = t.overdue.length + t.today.length;
  const week = t.week.length;
  const parts = [`진행 ${active}건`, urgent ? `지금 챙길 업무 ${urgent}건` : null, week ? `7일 안 업무 ${week}건` : null].filter(Boolean);
  return {
    key: `weekly_brief:${thisWeek.from}`,
    kind: "external",
    source: "주간 브리핑",
    text: `이번 주 브리핑 — ${parts.join(" · ")}`,
    urgency: 20,
    href: urgent || week ? "/tasks" : "/reports",
  };
}
