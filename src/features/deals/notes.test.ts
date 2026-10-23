import { describe, expect, it } from "vitest";
import { NOTE_MAX, toNoteRow } from "./notes";

const today = "2026-10-23";

describe("toNoteRow", () => {
  it("내용을 다듬고 날짜가 없으면 오늘", () => {
    expect(toNoteRow({ kind: "call", body: "  담당자 통화, 예산 확인  ", occurredOn: "" }, today)).toEqual({
      ok: true,
      row: { kind: "call", body: "담당자 통화, 예산 확인", occurred_on: today },
    });
    expect(toNoteRow({ kind: "meeting", body: "킥오프", occurredOn: "2026-10-20" }, today)).toMatchObject({ ok: true, row: { occurred_on: "2026-10-20" } });
  });

  it("잘못된 값 거부 — 종류·빈 내용·길이·날짜·미래", () => {
    expect(toNoteRow({ kind: "sms", body: "x", occurredOn: "" }, today).ok).toBe(false);
    expect(toNoteRow({ kind: "note", body: "   ", occurredOn: "" }, today).ok).toBe(false);
    expect(toNoteRow({ kind: "note", body: "가".repeat(NOTE_MAX + 1), occurredOn: "" }, today).ok).toBe(false);
    expect(toNoteRow({ kind: "note", body: "x", occurredOn: "2026/10/20" }, today).ok).toBe(false);
    expect(toNoteRow({ kind: "note", body: "x", occurredOn: "2026-10-24" }, today)).toMatchObject({ ok: false, error: expect.stringContaining("추적 업무") });
  });
});
