import { describe, expect, it } from "vitest";
import { mergeDeals, summarizeCompany, type CompanyDeal } from "./detail";

const d = (o: Partial<CompanyDeal>): CompanyDeal => ({
  id: "a",
  name: "사업",
  stage: "proposal",
  status: "active",
  amount: 100,
  gp: 10,
  ownerId: "u1",
  owner: "김영업",
  lastActivityAt: "2026-10-01T00:00:00Z",
  roles: ["customer"],
  ...o,
});

describe("mergeDeals", () => {
  it("같은 사업은 하나로, 역할은 모은다. 진행 중 → 수주 → 그 외 순", () => {
    const out = mergeDeals([
      d({ id: "lost", status: "lost", lastActivityAt: "2026-10-20T00:00:00Z" }),
      d({ id: "won", stage: "billing" }),
      d({ id: "a", roles: ["customer"] }),
      d({ id: "a", roles: ["si"] }),
      d({ id: "b", lastActivityAt: "2026-10-10T00:00:00Z" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["b", "a", "won", "lost"]);
    expect(out[1].roles).toEqual(["customer", "si"]);
  });
});

describe("summarizeCompany", () => {
  it("진행·수주·실주 건수와 금액, 담당자", () => {
    const s = summarizeCompany([
      d({ id: "a", amount: 300 }),
      d({ id: "b", status: "on_hold", amount: 200, owner: "이영업" }),
      d({ id: "c", stage: "won", amount: 500, gp: 50 }),
      d({ id: "e", stage: "won", status: "lost", amount: 900 }),
      d({ id: "f", status: "closed", amount: 1 }),
    ]);
    expect(s).toEqual({ total: 5, open: 2, openAmount: 500, won: 1, wonAmount: 500, wonGp: 50, lost: 1, owners: ["김영업", "이영업"] });
  });
});
