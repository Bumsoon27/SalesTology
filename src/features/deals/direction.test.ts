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

  it("단일 접점 — 1억 이상 수주 전 사업에서 최근 90일 상대가 한 명이면 경고", () => {
    const notes = (names: (string | null)[]) => names.map((c, i) => ({ occurred_on: `2026-10-${String(20 - i).padStart(2, "0")}`, counterpart: c }));
    const one = suggestDirections(deal({ deal_notes: notes(["김과장", " 김과장 ", null]) }), today, 5);
    expect(one.find((x) => x.kind === "single_thread")?.title).toContain("김과장 한 명");
    expect(suggestDirections(deal({ deal_notes: notes([null]) }), today, 5).find((x) => x.kind === "single_thread")?.title).toContain("누구와");
    // 두 명 이상·작은 사업·수주 후·최근 기록 없음은 경고 안 함
    expect(suggestDirections(deal({ deal_notes: notes(["김과장", "이부장"]) }), today, 5).some((x) => x.kind === "single_thread")).toBe(false);
    expect(suggestDirections(deal({ amount: 50_000_000, deal_notes: notes(["김과장"]) }), today, 5).some((x) => x.kind === "single_thread")).toBe(false);
    expect(suggestDirections(deal({ stage: "won", deal_notes: notes(["김과장"]) }), today, 5).some((x) => x.kind === "single_thread")).toBe(false);
    expect(suggestDirections(deal({ deal_notes: [{ occurred_on: "2026-01-01", counterpart: "김과장" }] }), today, 5).some((x) => x.kind === "single_thread")).toBe(false);
  });

  it("진행 중이 아닌 사업은 제안 없음", () => {
    expect(suggestDirections(deal({ status: "on_hold", issues: [{ id: "i", title: "x", status: "open" }] }), today)).toEqual([]);
  });
});

describe("topDirections", () => {
  it("급한 신호를 먼저, 남는 자리는 급한 일 없는 사업의 단계 제안(규모 큰 순)으로", () => {
    const r = topDirections(
      [
        { ...deal({ amount: 10 }), id: "small", name: "작음", customer: { id: "c", name: "A" } },
        { ...deal({ issues: [{ id: "i", title: "x", status: "open" }] }), id: "hot", name: "급함", customer: { id: "c", name: "B" } },
        { ...deal({ amount: 900, gp: 90 }), id: "big", name: "큼", customer: { id: "c", name: "C" } },
      ],
      today,
    );
    expect(r.map((x) => [x.dealId, x.kind])).toEqual([
      ["hot", "issue"],
      ["big", "stage"],
      ["small", "stage"],
    ]);
  });

  it("개수 제한", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...deal(), id: `d${i}`, name: `${i}`, customer: { id: "c", name: "A" } }));
    expect(topDirections(many, today, 4)).toHaveLength(4);
  });
});
