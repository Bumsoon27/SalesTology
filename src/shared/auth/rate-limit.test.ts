import { describe, expect, it } from "vitest";
import { allow } from "./rate-limit";

describe("allow", () => {
  it("1분에 5회까지 허용하고 6번째는 막는다", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(allow("ip-a", 5, 60_000, t + i)).toBe(true);
    expect(allow("ip-a", 5, 60_000, t + 10)).toBe(false);
  });

  it("1분이 지나면 다시 허용", () => {
    const t = 2_000_000;
    for (let i = 0; i < 5; i++) allow("ip-b", 5, 60_000, t);
    expect(allow("ip-b", 5, 60_000, t + 60_001)).toBe(true);
  });
});
