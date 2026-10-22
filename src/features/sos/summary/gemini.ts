import "server-only";
import { isAcceptableAiSummary } from "./validate";

export { isAcceptableAiSummary };

// 숫자 필드를 일부러 두지 않는다 — 모델이 숫자를 지어낼 여지를 없앤다
export type SummaryFacts = {
  orgName: string;
  title: string;
  stageLabel: string;
  keywords: string[];
  products: string[];
  signalTitles: string[];
};

const PROMPT =
  "너는 B2B IT 영업 보조원이다. 주어진 사실만으로 이 공고가 왜 영업기회인지 한국어 1~2문장으로 쓴다. 숫자·금액·날짜는 쓰지 않는다. 사실에 없는 기관·제품·내용을 지어내지 않는다.";
const TIMEOUT_MS = 10_000;

function factsText(f: SummaryFacts): string {
  const lines = [`기관: ${f.orgName}`, `사업명: ${f.title}`, `단계: ${f.stageLabel}`];
  if (f.keywords.length) lines.push(`일치 키워드: ${f.keywords.join(", ")}`);
  if (f.products.length) lines.push(`관련 제품: ${f.products.join(", ")}`);
  if (f.signalTitles.length) lines.push(`같은 기관 시그널: ${f.signalTitles.join(" / ")}`);
  return lines.join("\n");
}

/** Gemini(무료 티어)로 한 줄 요약. 어떤 실패든 null — 호출 쪽이 템플릿으로 대체한다. 키·응답 본문은 로그에 남기지 않는다. */
export async function summarizeWithGemini(
  facts: SummaryFacts,
  opts: { apiKey: string; fetchImpl?: typeof fetch; model?: string },
): Promise<string | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const model = opts.model ?? "gemini-2.5-flash";
  try {
    const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: "user", parts: [{ text: factsText(facts) }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const json = (await res.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: unknown }[] } }[] };
    // 잘린 응답(MAX_TOKENS 등)은 쓰지 않는다
    if (json.candidates?.[0]?.finishReason !== "STOP") return null;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    return isAcceptableAiSummary(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}
