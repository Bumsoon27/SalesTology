import { describe, expect, it } from "vitest";
import { buildNotifications, pickNext, type AppNotification } from "./build";
import type { TaskRow } from "@/features/deals/types";

const TODAY = "2026-10-20";
const task = (o: Partial<TaskRow>): TaskRow => ({ id: "t", type: "delivery", title: null, company_id: null, due_date: null, done_at: null, excluded_reason: null, ...o });
const deal = (o: Partial<Parameters<typeof buildNotifications>[0][number]> = {}) => ({
  id: "d1", name: "서버 구축", status: "active" as const, stage: "discovery" as const,
  customer: { id: "c", name: "A은행" }, deal_tasks: [] as TaskRow[], issues: [] as { id: string; title: string; status: "open" | "resolved" }[], ...o,
});

describe("buildNotifications", () => {
  it("열린 이슈는 긴급도 100", () => {
    const [n] = buildNotifications([deal({ issues: [{ id: "i1", title: "납기 지연", status: "open" }] })], TODAY);
    expect(n).toMatchObject({ kind: "issue", urgency: 100, key: "issue:i1:2026-10-20" });
  });

  it("계산서 기한 경과는 90, 그 외 경과는 85", () => {
    const ns = buildNotifications([deal({ deal_tasks: [task({ id: "a", type: "invoice_out", due_date: "2026-10-18" }), task({ id: "b", due_date: "2026-10-19" })] })], TODAY);
    expect(ns.map((n) => n.urgency)).toEqual([90, 85]);
    expect(ns[0].text).toContain("계산서 발행 필수 (2일 지남)");
  });

  it("14일 이내는 70 - 남은 일수, 15일은 알림 없음", () => {
    expect(buildNotifications([deal({ deal_tasks: [task({ due_date: "2026-10-23" })] })], TODAY)[0].urgency).toBe(67);
    expect(buildNotifications([deal({ deal_tasks: [task({ due_date: "2026-11-04" })] })], TODAY)).toHaveLength(0);
  });

  it("수주 이후 필수 일정 미등록", () => {
    const ns = buildNotifications([deal({ stage: "won" })], TODAY);
    expect(ns.map((n) => n.kind)).toEqual(["missing_schedule", "missing_schedule"]);
  });

  it("계약 종료 30일 이내는 종결 사업도 갱신 알림", () => {
    const ns = buildNotifications([deal({ status: "closed", period_end: "2026-11-14" })], TODAY);
    expect(ns[0]).toMatchObject({ kind: "renewal_soon", urgency: 55 - 25 / 2 });
  });

  it("보류·실주 사업은 업무 알림 없음", () => {
    expect(buildNotifications([deal({ status: "on_hold", deal_tasks: [task({ due_date: "2026-10-18" })] })], TODAY)).toHaveLength(0);
  });
});

describe("pickNext", () => {
  const items: AppNotification[] = ["a", "b", "c", "d"].map((k, i) => ({ key: k, kind: "issue", dealId: k, text: k, urgency: 10 * (i + 1) }));
  it("직전 3개는 고르지 않는다", () => {
    for (let i = 0; i < 20; i++) expect(pickNext(items, ["b", "c", "d"], Math.random)!.key).toBe("a");
  });
  it("긴급도에 비례해 고른다", () => {
    expect(pickNext(items, [], () => 0)!.key).toBe("a");
    expect(pickNext(items, [], () => 0.999)!.key).toBe("d");
  });
});
