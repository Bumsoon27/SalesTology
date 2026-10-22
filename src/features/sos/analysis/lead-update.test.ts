import { describe, expect, it } from "vitest";
import type { LeadDraft } from "./chain";
import { applyLeadUpdate, type StoredLead } from "./lead-update";

const d: LeadDraft = {
  chainKey: "plan:1", title: "t", orgName: "o", orgCode: null, stage: "prespec",
  budget: null, orderMonth: null, nextDeadlineAt: "2026-11-01T00:00:00Z", nextDeadlineType: "prespec_opinion", items: [],
};
const stored = (o: Partial<StoredLead> = {}): StoredLead => ({
  status: "new", stage: "prespec", nextDeadlineAt: "2026-11-01T00:00:00Z", touchedAt: null,
  hidden: false, hasNewProgress: false, keywordMismatch: false, ...o,
});

describe("applyLeadUpdate", () => {
  it("신규", () => {
    expect(applyLeadUpdate(null, { draft: d, matched: true })).toMatchObject({ create: true, status: "new", stage: "prespec", hidden: false });
    expect(applyLeadUpdate(null, { draft: d, matched: false })).toEqual({ create: false });
  });
  it("dismissed 는 상태·숨김 유지", () => {
    expect(applyLeadUpdate(stored({ status: "dismissed", stage: "prespec" }), { draft: { ...d, stage: "bid" }, matched: true })).toMatchObject({ create: false, stage: "bid" });
    const r = applyLeadUpdate(stored({ status: "dismissed", hidden: true }), { draft: d, matched: true });
    expect(r.status).toBeUndefined();
    expect(r.hidden).toBe(true);
  });
  it("on_hold 는 진행 시 새 진행 표시", () => {
    expect(applyLeadUpdate(stored({ status: "on_hold" }), { draft: { ...d, stage: "bid" }, matched: true }).hasNewProgress).toBe(true);
    expect(applyLeadUpdate(stored({ status: "on_hold" }), { draft: { ...d, nextDeadlineAt: "2026-11-05T00:00:00Z" }, matched: true }).hasNewProgress).toBe(true);
    expect("hasNewProgress" in applyLeadUpdate(stored({ status: "on_hold" }), { draft: d, matched: true })).toBe(false);
  });
  it("converted 는 단계·마감만", () => {
    const r = applyLeadUpdate(stored({ status: "converted" }), { draft: { ...d, stage: "bid" }, matched: true });
    expect(r.stage).toBe("bid");
    expect(r.status).toBeUndefined();
  });
  it("키워드 불일치", () => {
    expect(applyLeadUpdate(stored({ touchedAt: null }), { draft: d, matched: false })).toMatchObject({ create: false, hidden: true });
    expect(applyLeadUpdate(stored({ touchedAt: "2026-10-21T00:00:00Z" }), { draft: d, matched: false })).toMatchObject({ keywordMismatch: true, hidden: false });
    expect(applyLeadUpdate(stored({ hidden: true, keywordMismatch: true }), { draft: d, matched: true })).toMatchObject({ hidden: false, keywordMismatch: false });
  });
});
