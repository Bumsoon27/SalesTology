import { describe, expect, it } from "vitest";
import { daysUntil, parseKst, quarterOf, toG2bDateTime, todayInSeoul } from "./date";

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
