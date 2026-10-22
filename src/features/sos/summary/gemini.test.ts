import { describe, expect, it, vi } from "vitest";

// server-only 는 Next 번들러 밖에서 import 하면 던지므로 테스트에서는 무력화
vi.mock("server-only", () => ({}));

import { summarizeWithGemini } from "./gemini";
import { isAcceptableAiSummary } from "./validate";

const facts = { orgName: "○○공단", title: "백업장비 교체", stageLabel: "사전규격", keywords: ["LTO드라이브"], products: ["테이프 라이브러리"], signalTitles: [] };
const ok = (text: string) => async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));

describe("isAcceptableAiSummary", () => {
  it("검증", () => {
    expect(isAcceptableAiSummary("○○공단이 백업 장비 교체를 준비 중이라 테이프 라이브러리를 제안할 시점입니다.")).toBe(true);
    expect(isAcceptableAiSummary("예산 3억으로 발주합니다.")).toBe(false);
    expect(isAcceptableAiSummary("")).toBe(false);
    expect(isAcceptableAiSummary("가나다. 라마바. 사아자.")).toBe(false);
    expect(isAcceptableAiSummary("가".repeat(201))).toBe(false);
  });
});

describe("summarizeWithGemini", () => {
  it("숫자 포함 응답은 거부", async () => {
    expect(await summarizeWithGemini(facts, { apiKey: "k", fetchImpl: ok("예산 3억입니다.") as typeof fetch })).toBeNull();
  });
  it("실패 응답은 null", async () => {
    const failFetch = async () => new Response("quota", { status: 429 });
    expect(await summarizeWithGemini(facts, { apiKey: "k", fetchImpl: failFetch as typeof fetch })).toBeNull();
    const boom = async () => { throw new Error("net"); };
    expect(await summarizeWithGemini(facts, { apiKey: "k", fetchImpl: boom as typeof fetch })).toBeNull();
  });
  it("정상 응답과 요청 형태", async () => {
    const spy = vi.fn(ok("공단이 장비 교체를 준비 중입니다."));
    const r = await summarizeWithGemini(facts, { apiKey: "secret", fetchImpl: spy as unknown as typeof fetch });
    expect(r).toBe("공단이 장비 교체를 준비 중입니다.");
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
  });
});
