import { describe, expect, it } from "vitest";
import { bucketOf, collectTodos } from "./todo";
import type { DealRow, TaskRow } from "./types";

const task = (o: Partial<TaskRow>): TaskRow => ({ id: "t", type: "delivery", title: null, company_id: null, due_date: null, done_at: null, excluded_reason: null, ...o });
const deal = (o: Partial<DealRow>): DealRow =>
  ({ id: "d", name: "사업", stage: "won", status: "active", amount: 1, last_activity_at: "2026-10-01", customer: { id: "c", name: "한빛은행" }, deal_parties: [], deal_tasks: [], issues: [], ...o }) as DealRow;

describe("bucketOf", () => {
  it("기한별 묶음", () => {
    expect([bucketOf(-1), bucketOf(0), bucketOf(7), bucketOf(8), bucketOf(null)]).toEqual(["overdue", "today", "week", "later", "nodate"]);
  });
});

describe("collectTodos", () => {
  it("진행·보류 사업의 미완료 업무만, 기한 순", () => {
    const out = collectTodos(
      [
        deal({
          id: "a",
          deal_tasks: [
            task({ id: "1", due_date: "2026-10-30" }),
            task({ id: "2", due_date: "2026-10-27", type: "custom", title: "현장 실사" }),
            task({ id: "3", due_date: "2026-10-29" }),
            task({ id: "4", done_at: "2026-10-01" }),
            task({ id: "5", excluded_reason: "불필요" }),
            task({ id: "6" }),
          ],
        }),
        deal({ id: "b", status: "lost", deal_tasks: [task({ id: "9", due_date: "2026-10-28" })] }),
      ],
      "2026-10-28",
    );
    expect(out.overdue.map((t) => [t.taskId, t.title])).toEqual([["2", "현장 실사"]]);
    expect(out.week.map((t) => t.taskId)).toEqual(["3", "1"]);
    expect(out.today).toEqual([]);
    expect(out.nodate.map((t) => t.taskId)).toEqual(["6"]);
  });
});
