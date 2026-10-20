import { describe, expect, it } from "vitest";
import { buildMyUniverse } from "./build-graph";
import type { DealRow } from "@/features/deals/types";

const deal = (id: string, customer: string, partners: string[], amount = 1000): DealRow => ({
  id, name: `사업${id}`, stage: "discovery", status: "active", amount, last_activity_at: "2026-10-01T00:00:00Z",
  customer: { id: customer, name: customer },
  deal_parties: partners.map((p, i) => ({ id: `${id}-${i}`, role: "si", via_party_id: null, company: { id: p, name: p } })),
  deal_tasks: [], issues: [],
});

describe("buildMyUniverse", () => {
  it("나 → 고객사 → 사업 → 파트너 계층을 만든다", () => {
    const { nodes } = buildMyUniverse({ id: "u", name: "나" }, [deal("1", "A은행", ["가람"])], "2026-10-20");
    expect(nodes.map((n) => n.kind).sort()).toEqual(["customer", "deal", "me", "party"]);
    expect(nodes.find((n) => n.kind === "party")!.parentId).toBe("d:1");
  });

  it("여러 사업에 함께하는 파트너는 더 크고, 같은 refId 로 묶인다", () => {
    const { nodes } = buildMyUniverse(
      { id: "u", name: "나" },
      [deal("1", "A은행", ["가람", "누리"]), deal("2", "B공사", ["가람"])],
      "2026-10-20",
    );
    const garam = nodes.filter((n) => n.refId === "가람");
    const nuri = nodes.find((n) => n.refId === "누리")!;
    expect(garam).toHaveLength(2);
    expect(garam[0].weight).toBeGreaterThan(nuri.weight);
    expect(garam[0].label).toContain("2건");
  });

  it("실주·종결 사업은 그리지 않는다", () => {
    const lost = { ...deal("1", "A은행", []), status: "lost" as const };
    expect(buildMyUniverse({ id: "u", name: "나" }, [lost], "2026-10-20").nodes).toHaveLength(1);
  });
});
