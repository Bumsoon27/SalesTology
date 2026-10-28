import { describe, expect, it } from "vitest";
import { computeCompanyStatus, computeDealStatus, computePartyStatus, computeTaskState, seoulDay, todayInSeoul } from "./status";
import type { TaskRow } from "./types";

const TODAY = "2026-10-20";
const task = (over: Partial<TaskRow>): TaskRow => ({
  id: Math.random().toString(), type: "delivery", title: null, company_id: null,
  due_date: null, done_at: null, excluded_reason: null, ...over,
});
const deal = (over: Partial<Parameters<typeof computeDealStatus>[0]> = {}) => ({
  status: "active" as const, stage: "discovery" as const, deal_tasks: [] as TaskRow[], issues: [] as { id: string; title: string; status: "open" | "resolved" }[], ...over,
});

describe("computeTaskState", () => {
  it("완료 > 제외 > 미완료", () => {
    expect(computeTaskState(task({ done_at: "2026-10-01", excluded_reason: "x" }))).toBe("done");
    expect(computeTaskState(task({ excluded_reason: "해당 없음" }))).toBe("excluded");
    expect(computeTaskState(task({}))).toBe("open");
  });
});

describe("computeDealStatus", () => {
  it("열린 이슈가 있으면 RED", () => {
    const r = computeDealStatus(deal({ issues: [{ id: "1", title: "납기", status: "open" }] }), TODAY);
    expect(r).toMatchObject({ status: "red", reason: "이슈 1" });
  });

  it("기한 14일 이내 미완료 업무는 YELLOW, 15일이면 GREEN (경계)", () => {
    expect(computeDealStatus(deal({ deal_tasks: [task({ due_date: "2026-11-03" })] }), TODAY).status).toBe("yellow"); // D-14
    expect(computeDealStatus(deal({ deal_tasks: [task({ due_date: "2026-11-04" })] }), TODAY).status).toBe("green"); // D-15
  });

  it("기한 지난 업무는 사유에 +N일", () => {
    const r = computeDealStatus(deal({ deal_tasks: [task({ type: "invoice_out", due_date: "2026-10-18" })] }), TODAY);
    expect(r.reason).toBe("확인 1 · 계산서 +2일");
  });

  it("완료·제외 업무는 무시", () => {
    const r = computeDealStatus(deal({ deal_tasks: [task({ due_date: "2026-10-18", done_at: "2026-10-18" })] }), TODAY);
    expect(r.status).toBe("green");
  });

  it("수주 이후 필수 업무 일정이 없으면 '일정 미등록'", () => {
    const r = computeDealStatus(deal({ stage: "won" }), TODAY);
    expect(r.status).toBe("yellow");
    expect(r.reason).toContain("일정 미등록");
  });

  it("보류·실주는 별도 상태", () => {
    expect(computeDealStatus(deal({ status: "on_hold" }), TODAY).status).toBe("hold");
    expect(computeDealStatus(deal({ status: "lost" }), TODAY).status).toBe("grey");
  });
});

describe("computePartyStatus", () => {
  it("관련 없는 매입처로 상태가 번지지 않는다", () => {
    const tasks = [task({ company_id: "A", due_date: "2026-10-21" })];
    expect(computePartyStatus(tasks, "A", TODAY).status).toBe("yellow");
    expect(computePartyStatus(tasks, "B", TODAY).status).toBe("green");
  });
});

describe("computeCompanyStatus", () => {
  it("진행 중 사업 중 가장 심각한 상태", () => {
    expect(
      computeCompanyStatus(
        [
          { status: "active", last_activity_at: "2026-10-01T00:00:00Z", computed: "green" },
          { status: "active", last_activity_at: "2026-10-01T00:00:00Z", computed: "red" },
        ],
        TODAY,
      ),
    ).toBe("red");
  });

  it("진행 중 사업이 없고 180일 지나면 소원 (경계)", () => {
    const old = (date: string) => [{ status: "closed" as const, last_activity_at: `${date}T00:00:00Z`, computed: "grey" as const }];
    expect(computeCompanyStatus(old("2026-04-23"), TODAY)).toBe("grey"); // 180일
    expect(computeCompanyStatus(old("2026-04-24"), TODAY)).toBe("green"); // 179일
  });
});

describe("todayInSeoul", () => {
  it("UTC 15시 이후는 서울 기준 다음 날", () => {
    expect(todayInSeoul(new Date("2026-10-20T15:30:00Z"))).toBe("2026-10-21");
  });
});

describe("seoulDay", () => {
  it("UTC 시각을 서울 날짜로 (00~09시 KST 는 UTC 로 전날)", () => {
    expect(seoulDay("2026-10-25T16:30:00Z")).toBe("2026-10-26"); // 서울 01:30
    expect(seoulDay("2026-10-26T14:59:00+00:00")).toBe("2026-10-26"); // 서울 23:59
    expect(seoulDay("2026-10-26")).toBe("2026-10-26");
  });
});
