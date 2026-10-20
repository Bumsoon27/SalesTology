import { describe, expect, it } from "vitest";
import { computeTargets } from "./layout";
import type { UniverseNode } from "./types";

const n = (id: string, kind: UniverseNode["kind"], parentId: string | null): UniverseNode => ({
  id, kind, parentId, label: id, status: "green", weight: 0.5,
});

describe("computeTargets", () => {
  it("리프 수에 비례해 부채꼴을 나눈다", () => {
    // A 고객사는 사업 3개(리프 3), B 고객사는 사업 1개(리프 1) → A가 3/4 원
    const nodes = [
      n("me", "me", null),
      n("A", "customer", "me"), n("a1", "deal", "A"), n("a2", "deal", "A"), n("a3", "deal", "A"),
      n("B", "customer", "me"), n("b1", "deal", "B"),
    ];
    const t = computeTargets(nodes);
    const start = -Math.PI / 2;
    expect(t.get("A")!.angle).toBeCloseTo(start + (Math.PI * 2 * 0.75) / 2);
    expect(t.get("B")!.angle).toBeCloseTo(start + Math.PI * 2 * 0.75 + (Math.PI * 2 * 0.25) / 2);
    expect(t.get("a1")!.depth).toBe(2);
  });

  it("자식은 부모 부채꼴 안에 들어간다", () => {
    const nodes = [n("me", "me", null), n("A", "customer", "me"), n("a1", "deal", "A"), n("p", "party", "a1"), n("B", "customer", "me")];
    const t = computeTargets(nodes);
    expect(t.get("p")!.angle).toBeCloseTo(t.get("a1")!.angle);
    expect(t.get("p")!.depth).toBe(3);
  });
});
