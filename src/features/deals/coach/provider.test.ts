import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { askCoach, coachProvider } from "./provider";
import type { CoachSignals } from "./signals";

const signals = { 단계: "제안" } as unknown as CoachSignals;
const chat = (content: unknown, finish = "stop", status = 200) => async () =>
  new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }] }), { status });

afterEach(() => vi.unstubAllEnvs());

describe("coachProvider", () => {
  it("설정이 없거나 불완전하면 null (규칙 기반)", () => {
    vi.stubEnv("AI_COACH_PROVIDER", "");
    expect(coachProvider()).toBeNull();
    vi.stubEnv("AI_COACH_PROVIDER", "openai");
    vi.stubEnv("AI_COACH_MODEL", "qwen");
    expect(coachProvider()).toBeNull(); // 주소 없음
    vi.stubEnv("AI_COACH_BASE_URL", "http://llm.internal/v1");
    expect(coachProvider()).toBeNull(); // https 만
    vi.stubEnv("AI_COACH_BASE_URL", "https://llm.example.com/v1");
    expect(coachProvider()).toEqual({ kind: "openai", model: "qwen" });
  });

  it("gemini 는 키가 있어야", () => {
    vi.stubEnv("AI_COACH_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(coachProvider()).toBeNull();
    vi.stubEnv("GEMINI_API_KEY", "k");
    expect(coachProvider()?.kind).toBe("gemini");
  });
});

describe("askCoach (OpenAI 호환)", () => {
  const setup = () => {
    vi.stubEnv("AI_COACH_PROVIDER", "openai");
    vi.stubEnv("AI_COACH_BASE_URL", "https://llm.example.com/v1/");
    vi.stubEnv("AI_COACH_MODEL", "qwen");
    vi.stubEnv("AI_COACH_API_KEY", "secret");
  };

  it("정상 응답 → 텍스트, 주소·헤더·신호 전달", async () => {
    setup();
    const f = vi.fn(chat("진단: x"));
    expect(await askCoach(signals, f as unknown as typeof fetch)).toEqual({ text: "진단: x", model: "qwen" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(String(init.body)).toContain("제안");
  });

  it("오류·잘린 응답·예외는 null", async () => {
    setup();
    expect(await askCoach(signals, chat("x", "stop", 500) as unknown as typeof fetch)).toBeNull();
    expect(await askCoach(signals, chat("x", "length") as unknown as typeof fetch)).toBeNull();
    expect(await askCoach(signals, chat(42) as unknown as typeof fetch)).toBeNull();
    expect(
      await askCoach(signals, (async () => {
        throw new Error("down");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});
