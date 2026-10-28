// 할 일 — 여러 사업의 추적 업무를 기한별로 모은다 (지남·오늘·이번 주·이후·기한 없음). 순수 함수 (테스트: todo.test.ts)
// 참고: Salesforce·HubSpot 의 Tasks 화면. 진행 중·보류 사업의 미완료 업무만 (수주 이후 배송·계산서도 포함)
import { computeTaskState, daysUntil } from "./status";
import { TASK_LABEL, type DealRow } from "./types";

export type TodoBucket = "overdue" | "today" | "week" | "later" | "nodate";
export const BUCKETS: TodoBucket[] = ["overdue", "today", "week", "later", "nodate"];
export const BUCKET_LABEL: Record<TodoBucket, string> = { overdue: "기한 지남", today: "오늘", week: "7일 안", later: "이후", nodate: "기한 없음" };

export type Todo = {
  taskId: string;
  title: string;
  due: string | null;
  days: number | null;
  dealId: string;
  dealName: string;
  customer: string;
  owner?: string;
};

export function bucketOf(days: number | null): TodoBucket {
  if (days == null) return "nodate";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

export function collectTodos(deals: (DealRow & { owner?: string })[], today: string): Record<TodoBucket, Todo[]> {
  const out: Record<TodoBucket, Todo[]> = { overdue: [], today: [], week: [], later: [], nodate: [] };
  for (const d of deals) {
    if (d.status !== "active" && d.status !== "on_hold") continue;
    for (const t of d.deal_tasks) {
      if (computeTaskState(t) !== "open") continue;
      const days = t.due_date ? daysUntil(t.due_date, today) : null;
      out[bucketOf(days)].push({
        taskId: t.id,
        title: t.type === "custom" ? (t.title ?? "업무") : TASK_LABEL[t.type],
        due: t.due_date,
        days,
        dealId: d.id,
        dealName: d.name,
        customer: d.customer.name,
        owner: d.owner,
      });
    }
  }
  for (const b of BUCKETS) out[b].sort((a, b2) => (a.due ?? "9999").localeCompare(b2.due ?? "9999") || a.dealName.localeCompare(b2.dealName));
  return out;
}
