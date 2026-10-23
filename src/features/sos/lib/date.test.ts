import { describe, expect, it } from "vitest";
import { daysUntil, deadlineWindow, parseKst, quarterOf, toG2bDateTime, todayInSeoul } from "./date";

describe("date", () => {
  it("parseKst: KST 문자열 → ISO", () => {
    expect(parseKst("2026-10-25 23:59:00")).toBe("2026-10-25T14:59:00.000Z");
    expect(parseKst("")).toBeNull();
    expect(parseKst(null)).toBeNull();
    expect(parseKst("garbage")).toBeNull();
  });
  it("daysUntil: 서울 날짜 기준 D-n", () => {
    const d = parseKst("2026-10-25 23:59:00")!;
    expect(daysUntil(d, "2026-10-22")).toBe(3);
    expect(daysUntil(d, "2026-10-25")).toBe(0);
    expect(daysUntil(d, "2026-10-21")).toBe(4);
    expect(daysUntil(d, "2026-10-27")).toBe(-2);
  });
  it("todayInSeoul / toG2bDateTime", () => {
    expect(todayInSeoul(new Date("2026-10-21T15:30:00Z"))).toBe("2026-10-22");
    expect(toG2bDateTime(new Date("2026-10-21T15:30:00Z"))).toBe("202610220030");
  });
  it("quarterOf", () => {
    expect(quarterOf("2026-10")).toBe("2026-Q4");
    expect(quarterOf("2026-03")).toBe("2026-Q1");
  });
});

describe("마감 n일 안 (KST 달력)", () => {
  it("오늘 0시(KST)부터 오늘+n일 끝까지 — D-n 표시와 같은 기준", () => {
    expect(deadlineWindow("2026-10-22", 3)).toEqual({
      from: "2026-10-21T15:00:00.000Z",
      before: "2026-10-25T15:00:00.000Z",
    });
  });

  it("경계: 10-25 23:59 KST 마감은 3일 안, 10-26 00:00 은 밖", () => {
    const w = deadlineWindow("2026-10-22", 3);
    const inside = parseKst("2026-10-25 23:59:00")!;
    const outside = parseKst("2026-10-26 00:00:00")!;
    expect(inside >= w.from && inside < w.before).toBe(true);
    expect(outside < w.before).toBe(false);
    expect(daysUntil(inside, "2026-10-22")).toBe(3);
  });
});
