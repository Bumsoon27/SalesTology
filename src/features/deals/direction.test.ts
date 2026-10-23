import { describe, expect, it } from "vitest";
import { suggestDirections, topDirections } from "./direction";
import type { TaskRow } from "./types";

const today = "2026-10-23";
const task = (o: Partial<TaskRow>): TaskRow => ({ id: "t", type: "delivery", title: null, company_id: null, due_date: null, done_at: null, excluded_reason: null, ...o });
const deal = (o: Partial<Parameters<typeof suggestDirections>[0]> = {}) => ({
  stage: "proposal" as const,
  status: "active" as const,
  amount: 100_000_000,
  gp: 10_000_000,
  last_activity_at: "2026-10-22T00:00:00Z",
  deal_tasks: [] as TaskRow[],
  issues: [] as { id: string; title: string; status: "open" | "resolved" }[],
  ...o,
});

describe("suggestDirections", () => {
  it("이슈 > 기한 지남 > 임박 순, 최대 3개", () => {
    const r = suggestDirections(
      deal({
        issues: [{ id: "i", title: "납기 지연", status: "open" }],
        deal_tasks: [task({ id: "a", due_date: "2026-10-20" }), task({ id: "b", type: "invoice_out", due_date: "2026-10-24" })],
      }),
      today,
    );
    expect(r.map((x) => x.kind)).toEqual(["issue", "overdue", "due_soon"]);
    expect(r[1].title).toContain("3일 지남");
    expect(r[2].title).toContain("D-1");
  });

  it("급한 게 없으면 단계별 기본 제안", () => {
    const r = suggestDirections(deal(), today);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "stage", title: "제안 피드백 받고 경쟁사 확인" });
  });

  it("정체·빈칸·낮은 마진", () => {
    expect(suggestDirections(deal({ last_activity_at: "2026-09-01T00:00:00Z" }), today)[0]).toMatchObject({ kind: "stale" });
    expect(suggestDirections(deal({ amount: null }), today)[0]).toMatchObject({ kind: "data", title: "사업 규모 입력" });
    expect(suggestDirections(deal({ gp: null }), today)[0]).toMatchObject({ kind: "data", title: "GP 입력" });
    expect(suggestDirections(deal({ gp: 1_000_000 }), today)[0]).toMatchObject({ kind: "margin" });
  });

  it("수주 이후 배송·계산서 일정이 없으면 등록 제안, 끝난 업무는 무시", () => {
    const r = suggestDirections(deal({ stage: "won", deal_tasks: [task({ due_date: "2026-01-01", done_at: "2026-01-01" })] }), today, 5);
    expect(r.filter((x) => x.kind === "missing_schedule").map((x) => x.title)).toEqual(["계산서 일정 등록"]);
    expect(r.some((x) => x.kind === "overdue")).toBe(false);
  });

  it("진행 중이 아닌 사업은 제안 없음", () => {
    expect(suggestDirections(deal({ status: "on_hold", issues: [{ id: "i", title: "x", status: "open" }] }), today)).toEqual([]);
  });
});

describe("topDirections", () => {
  it("여러 사업에서 급한 순으로 모으고 단계 기본 제안은 뺀다", () => {
    const r = topDirections(
      [
        { ...deal(), id: "d1", name: "평온", customer: { id: "c", name: "A" } },
        { ...deal({ issues: [{ id: "i", title: "x", status: "open" }] }), id: "d2", name: "급함", customer: { id: "c", name: "B" } },
      ],
      today,
    );
    expect(r.map((x) => [x.dealId, x.kind])).toEqual([["d2", "issue"]]);
  });
});
