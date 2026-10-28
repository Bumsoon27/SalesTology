import { describe, expect, it } from "vitest";
import type { DealRow, TaskRow } from "@/features/deals/types";
import { weeklyBriefNotification } from "./weekly";

const task = (o: Partial<TaskRow>): TaskRow => ({ id: "t", type: "delivery", title: null, company_id: null, due_date: null, done_at: null, excluded_reason: null, ...o });
const deal = (o: Partial<DealRow>): DealRow =>
  ({ id: "d", name: "사업", stage: "won", status: "active", amount: 1, last_activity_at: "2026-10-01", customer: { id: "c", name: "한빛은행" }, deal_parties: [], deal_tasks: [], issues: [], ...o }) as DealRow;

describe("weeklyBriefNotification", () => {
  const deals = [deal({ deal_tasks: [task({ id: "1", due_date: "2026-10-25" }), task({ id: "2", due_date: "2026-10-30" })] }), deal({ id: "b", status: "lost" })];
  it("월·화요일에만, 그 주 월요일 key, 업무가 있으면 할 일로", () => {
    expect(weeklyBriefNotification(deals, "2026-10-26")).toEqual({
      key: "weekly_brief:2026-10-26",
      kind: "external",
      source: "주간 브리핑",
      text: "이번 주 브리핑 — 진행 1건 · 지금 챙길 업무 1건 · 7일 안 업무 1건",
      urgency: 20,
      href: "/tasks",
    });
    expect(weeklyBriefNotification(deals, "2026-10-27")?.key).toBe("weekly_brief:2026-10-26");
    expect(weeklyBriefNotification(deals, "2026-10-28")).toBeNull();
    expect(weeklyBriefNotification([deal({})], "2026-11-02")).toMatchObject({ text: "이번 주 브리핑 — 진행 1건", href: "/reports" });
  });
});
