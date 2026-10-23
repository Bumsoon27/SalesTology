import "server-only";

// SOS 비밀값은 여기서만 읽는다. 값은 로그·응답에 남기지 않는다.
export function sosEnv(): { dataGoKrKey: string; geminiKey: string | null } {
  const dataGoKrKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!dataGoKrKey) throw new Error("나라장터 서비스키가 설정되지 않았습니다.");
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || null;
  return { dataGoKrKey, geminiKey };
}

/** Gemini 키만 (수집 없이 재분석할 때 나라장터 키가 없어도 동작하게) */
export function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}
