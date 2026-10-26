import "server-only";

// sLLM 연결 — 서버에서만. 키·응답 본문은 로그에 남기지 않는다. 어떤 실패든 null (호출 쪽이 규칙 기반으로 대체)
//
// 환경변수 (Vercel 에만, NEXT_PUBLIC_ 금지)
//   AI_COACH_PROVIDER = openai | gemini        (없으면 규칙 기반만)
//   openai: OpenAI 호환 API — 사내 sLLM(vLLM·Ollama·LM Studio 등) 또는 호환 서비스
//     AI_COACH_BASE_URL  예) https://llm.example.co.kr/v1   (https 만)
//     AI_COACH_MODEL     예) qwen2.5-7b-instruct
//     AI_COACH_API_KEY   (선택)
//   gemini: GEMINI_API_KEY (SOS 와 같은 키), AI_COACH_MODEL (선택, 기본 gemini-flash-latest)
import { SYSTEM_PROMPT, userPrompt } from "./advice";
import type { CoachSignals } from "./signals";

const TIMEOUT_MS = 15_000;
const MAX_TOKENS = 800;

export type CoachProvider = { kind: "openai" | "gemini"; model: string };

/** 설정이 완전할 때만 공급자를 돌려준다 (화면에 '어떤 모델인지' 표시용, 키는 포함하지 않는다) */
export function coachProvider(): CoachProvider | null {
  const kind = process.env.AI_COACH_PROVIDER?.trim();
  if (kind === "openai") {
    const base = process.env.AI_COACH_BASE_URL?.trim();
    const model = process.env.AI_COACH_MODEL?.trim();
    if (!base || !model || !/^https:\/\//.test(base)) return null;
    return { kind, model };
  }
  if (kind === "gemini") {
    if (!process.env.GEMINI_API_KEY?.trim()) return null;
    return { kind, model: process.env.AI_COACH_MODEL?.trim() || "gemini-flash-latest" };
  }
  return null;
}

export async function askCoach(signals: CoachSignals, fetchImpl: typeof fetch = fetch): Promise<{ text: string; model: string } | null> {
  const p = coachProvider();
  if (!p) return null;
  try {
    if (p.kind === "openai") {
      const base = process.env.AI_COACH_BASE_URL!.trim().replace(/\/+$/, "");
      const key = process.env.AI_COACH_API_KEY?.trim();
      const res = await fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.3,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt(signals) },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
      if (res.status !== 200) return null;
      const json = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: unknown } }[] };
      const c = json.choices?.[0];
      if (!c || (c.finish_reason && c.finish_reason !== "stop") || typeof c.message?.content !== "string") return null;
      return { text: c.message.content, model: p.model };
    }

    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY!.trim() },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(signals) }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS * 2, temperature: 0.3, thinkingConfig: { thinkingLevel: "low" } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    if (res.status !== 200) return null;
    const json = (await res.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: unknown; thought?: boolean }[] } }[] };
    if (json.candidates?.[0]?.finishReason !== "STOP") return null;
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((x) => !x.thought && typeof x.text === "string")
      .map((x) => x.text as string)
      .join("");
    return text.trim() ? { text, model: p.model } : null;
  } catch {
    return null;
  }
}
