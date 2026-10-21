import { describe, expect, it } from "vitest";
import { loadExternalNotifications, type NotificationProvider } from "./providers";

const ctx = { userId: "u", teamId: "t", today: "2026-10-21" };
const ok: NotificationProvider = {
  id: "sos",
  load: async () => [{ key: "sos:signal:1:2026-10-21", text: "A은행 — 신규 입찰 공고", urgency: 70, href: "/sos/signals/1", source: "SOS" }],
};

describe("loadExternalNotifications", () => {
  it("공급자 알림을 모은다", async () => {
    expect(await loadExternalNotifications(ctx, [ok])).toHaveLength(1);
  });

  it("실패하거나 느린 공급자는 무시한다", async () => {
    const broken: NotificationProvider = { id: "broken", load: async () => Promise.reject(new Error("x")) };
    const slow: NotificationProvider = { id: "slow", load: () => new Promise((r) => setTimeout(() => r([]), 100)) };
    expect(await loadExternalNotifications(ctx, [ok, broken, slow], 20)).toHaveLength(1);
  });

  it("외부 주소나 빈 값은 걸러낸다", async () => {
    const bad: NotificationProvider = {
      id: "bad",
      load: async () => [
        { key: "k", text: "t", urgency: 10, href: "https://evil.example", source: "X" },
        { key: "", text: "t", urgency: 10, href: "/a", source: "X" },
        { key: "k2", text: "t", urgency: 10, href: "//evil.example", source: "X" },
      ],
    };
    expect(await loadExternalNotifications(ctx, [bad])).toHaveLength(0);
  });
});
