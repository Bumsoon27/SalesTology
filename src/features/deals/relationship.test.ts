import { describe, expect, it } from "vitest";
import { relationshipStrength, strengthByCompany } from "./relationship";

const today = "2026-10-24";

describe("relationshipStrength", () => {
  it("기록이 없으면 0점·소원", () => {
    expect(relationshipStrength([], today)).toEqual({ score: 0, tier: "cold", lastOn: null, count: 0 });
  });

  it("최근 미팅·통화가 많으면 강함, 오래된 기록은 약해진다", () => {
    const recent = relationshipStrength(
      [
        { on: "2026-10-23", kind: "meeting" },
        { on: "2026-10-20", kind: "call" },
        { on: "2026-10-15", kind: "email" },
      ],
      today,
    );
    expect(recent.tier).toBe("strong");
    expect(recent.lastOn).toBe("2026-10-23");

    const old = relationshipStrength([{ on: "2026-06-01", kind: "meeting" }], today);
    expect(old.score).toBeLessThan(15);
    expect(old.tier).toBe("cold");
  });

  it("1년 넘은 기록·미래 날짜는 세지 않는다", () => {
    expect(relationshipStrength([{ on: "2025-01-01", kind: "meeting" }, { on: "2026-12-01", kind: "call" }], today).count).toBe(0);
  });

  it("같은 기록 수라도 최근일수록 점수가 높다", () => {
    const a = relationshipStrength([{ on: "2026-10-22", kind: "call" }], today).score;
    const b = relationshipStrength([{ on: "2026-09-01", kind: "call" }], today).score;
    expect(a).toBeGreaterThan(b);
  });
});

describe("strengthByCompany", () => {
  it("사업의 상호작용은 고객사와 관계사 모두에 반영", () => {
    const m = strengthByCompany(
      [
        {
          last_activity_at: "2026-10-23T00:00:00Z",
          customer: { id: "bank" },
          deal_parties: [{ company: { id: "si" } }],
          deal_tasks: [{ done_at: "2026-10-22T00:00:00Z" }, { done_at: null }],
          deal_notes: [{ kind: "meeting", occurred_on: "2026-10-21" }],
        },
      ],
      today,
    );
    expect(m.get("bank")?.count).toBe(3);
    expect(m.get("si")?.score).toBe(m.get("bank")?.score);
  });
});
