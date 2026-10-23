import { describe, expect, it } from "vitest";
import { parseKst } from "./lib/date";
import { buildPrespecNotifications } from "./notifications";

describe("buildPrespecNotifications", () => {
  const ctx = { userId: "u1", teamId: "t1", today: "2026-10-22", view: "mine" as const };
  const lead = { id: "L1", orgName: "○○공단", title: "백업장비 교체", budget: 320000000, nextDeadlineAt: parseKst("2026-10-25 23:59:00")!, assigneeId: "u1" };

  it("D-3 은 알림", () => {
    expect(buildPrespecNotifications([lead], ctx, 3)).toEqual([
      { key: "sos:prespec_deadline:L1:2026-10-22", text: "○○공단 · 백업장비 교체 — 사전규격 의견 마감 D-3 (예산 3.2억)", urgency: 67, href: "/sos?lead=L1", source: "SOS" },
    ]);
  });

  it("D-4 는 제외 (Review Focus 3)", () => {
    expect(buildPrespecNotifications([lead], { ...ctx, today: "2026-10-21" }, 3)).toEqual([]);
  });

  it("mine 은 내 담당만, team 은 부문 전체", () => {
    expect(buildPrespecNotifications([{ ...lead, assigneeId: "u2" }], ctx, 3)).toEqual([]);
    expect(buildPrespecNotifications([{ ...lead, assigneeId: "u2" }], { ...ctx, view: "team" }, 3)).toHaveLength(1);
  });

  it("마감 지남은 제외, 당일은 D-0", () => {
    expect(buildPrespecNotifications([lead], { ...ctx, today: "2026-10-26" }, 3)).toEqual([]);
    expect(buildPrespecNotifications([lead], { ...ctx, today: "2026-10-25" }, 3)[0]).toMatchObject({ urgency: 70, key: "sos:prespec_deadline:L1:2026-10-25" });
  });

  it("예산 미공개", () => {
    expect(buildPrespecNotifications([{ ...lead, budget: null }], ctx, 3)[0].text).toBe("○○공단 · 백업장비 교체 — 사전규격 의견 마감 D-3 (예산 미공개)");
  });
});
