import { describe, expect, it } from "vitest";
import { parseListQuery } from "./list-query";
import {
  deadlineView,
  evidenceList,
  formatOrderMonth,
  groupProducts,
  leadHref,
  parseLeadId,
  safeExternalUrl,
  stageSteps,
} from "./lead-view";

const ID = "0b6f3c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

describe("카드 표시 도우미", () => {
  it("deadlineView: D-3 이내 빨강, D-7 이내 노랑, 지남·없음은 흐리게", () => {
    const today = "2026-10-22";
    expect(deadlineView(null, today)).toEqual({ text: "미공개", tone: "hint" });
    expect(deadlineView("2026-10-25T14:59:00.000Z", today)).toEqual({ text: "D-3", tone: "red" });
    expect(deadlineView("2026-10-22T05:00:00.000Z", today)).toEqual({ text: "D-0", tone: "red" });
    expect(deadlineView("2026-10-26T01:00:00.000Z", today)).toEqual({ text: "D-4", tone: "yellow" });
    expect(deadlineView("2026-10-29T01:00:00.000Z", today)).toEqual({ text: "D-7", tone: "yellow" });
    expect(deadlineView("2026-10-30T01:00:00.000Z", today)).toEqual({ text: "D-8", tone: "normal" });
    expect(deadlineView("2026-10-20T01:00:00.000Z", today)).toEqual({ text: "지남", tone: "hint" });
  });

  it("stageSteps: 지난·현재·남은 단계", () => {
    expect(stageSteps("prespec").map((s) => [s.stage, s.state])).toEqual([
      ["plan", "past"],
      ["prespec", "current"],
      ["bid", "future"],
      ["award", "future"],
      ["contract", "future"],
    ]);
    expect(stageSteps("plan")[0]).toEqual({ stage: "plan", label: "발주계획", state: "current" });
  });

  it("formatOrderMonth: 월 첫날 날짜 → 'YYYY년 M월'", () => {
    expect(formatOrderMonth("2026-03-01")).toBe("2026년 3월");
    expect(formatOrderMonth("2026-11")).toBe("2026년 11월");
    expect(formatOrderMonth(null)).toBe("미공개");
    expect(formatOrderMonth("bad")).toBe("미공개");
  });

  it("safeExternalUrl: http(s) 주소만", () => {
    expect(safeExternalUrl("https://www.g2b.go.kr/x?a=1")).toBe("https://www.g2b.go.kr/x?a=1");
    expect(safeExternalUrl("http://www.g2b.go.kr")).toBe("http://www.g2b.go.kr/");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });

  it("parseLeadId: uuid 만, 배열이면 첫 값", () => {
    expect(parseLeadId(ID)).toBe(ID);
    expect(parseLeadId([ID, "x"])).toBe(ID);
    expect(parseLeadId("1; drop")).toBeNull();
    expect(parseLeadId(undefined)).toBeNull();
  });

  it("leadHref: 지금 목록 조건 + lead", () => {
    const q = parseListQuery({ team: "t1", view: "org" });
    expect(leadHref(q, ID)).toBe(`/sos?team=t1&view=org&lead=${ID}`);
    expect(leadHref(parseListQuery({}), ID)).toBe(`/sos?lead=${ID}`);
    expect(leadHref(q, null)).toBe("/sos?team=t1&view=org");
  });

  it("evidenceList: 같은 원본은 한 번, 최근 날짜 먼저, 위험한 링크는 버린다", () => {
    const rows = [
      { rawItemId: "r1", source: "g2b_plan" as const, title: "계획", publishedAt: "2026-09-01T00:00:00Z", url: "https://a" },
      { rawItemId: "r2", source: "g2b_bid" as const, title: "공고", publishedAt: "2026-10-01T00:00:00Z", url: "javascript:x" },
      { rawItemId: "r1", source: "g2b_plan" as const, title: "계획", publishedAt: "2026-09-01T00:00:00Z", url: "https://a" },
      { rawItemId: "r3", source: "g2b_prespec" as const, title: "규격", publishedAt: null, url: null },
    ];
    expect(evidenceList(rows)).toEqual([
      { id: "r2", source: "g2b_bid", sourceLabel: "입찰공고", title: "공고", publishedAt: "2026-10-01T00:00:00Z", url: null },
      { id: "r1", source: "g2b_plan", sourceLabel: "발주계획", title: "계획", publishedAt: "2026-09-01T00:00:00Z", url: "https://a/" },
      { id: "r3", source: "g2b_prespec", sourceLabel: "사전규격", title: "규격", publishedAt: null, url: null },
    ]);
  });

  it("groupProducts: 제품마다 연결된 일치 키워드", () => {
    const keywords = [
      { id: "k1", term: "IBM" },
      { id: "k2", term: "서버" },
    ];
    const links = [
      { keywordId: "k1", product: { id: "p1", name: "IBM Power11", vendor: "IBM" } },
      { keywordId: "k2", product: { id: "p1", name: "IBM Power11", vendor: "IBM" } },
      { keywordId: "k2", product: { id: "p2", name: "Lenovo ThinkSystem", vendor: null } },
      { keywordId: "kX", product: { id: "p3", name: "다른 키워드", vendor: null } },
    ];
    expect(groupProducts(links, keywords)).toEqual([
      { id: "p1", name: "IBM Power11", vendor: "IBM", terms: ["IBM", "서버"] },
      { id: "p2", name: "Lenovo ThinkSystem", vendor: null, terms: ["서버"] },
    ]);
  });
});
