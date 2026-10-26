// AI 코칭 — 프롬프트·응답 검증·규칙 기반 코칭. 순수 함수 (테스트: advice.test.ts)
import type { CoachSignals } from "./signals";

export type Advice = {
  /** 한두 문장 진단 */
  diagnosis: string;
  /** 영업 방향 (전략) */
  strategy: string[];
  /** 이번 주 할 일 */
  actions: string[];
};

export const SYSTEM_PROMPT = [
  "너는 한국 B2B IT 솔루션 영업(공공·금융 고객, SI·매입처와 함께 진행)을 돕는 영업 코치다.",
  "주어진 익명 신호만 근거로 이 영업기회의 상황을 진단하고 영업 방향을 제안한다.",
  "규칙:",
  "- 신호에 없는 사실(회사명·사람·금액·날짜·경쟁사)을 지어내지 않는다.",
  "- 실무자가 바로 실행할 수 있게 구체적으로, 존댓말로, 짧게 쓴다.",
  "- 아래 형식 그대로 한국어로만 답한다. 다른 말·마크다운 기호(#, *)는 쓰지 않는다.",
  "진단: (1~2문장)",
  "영업 방향:",
  "- (2~3개)",
  "이번 주 할 일:",
  "- (2~4개)",
].join("\n");

export function userPrompt(s: CoachSignals): string {
  return `영업기회 신호(JSON):\n${JSON.stringify(s, null, 1)}`;
}

const MAX_LEN = 1500;

/** 모델 응답 → Advice. 형식이 안 맞거나 위험한 내용이면 null (호출 쪽이 규칙 기반으로 대체) */
export function parseAdvice(raw: string): Advice | null {
  const text = raw.replace(/\r/g, "").replace(/[*#`]/g, "").trim();
  if (text.length < 20 || text.length > MAX_LEN) return null;
  if (/https?:\/\/|www\.|<[a-z/]/i.test(text)) return null; // 링크·HTML 은 받지 않는다

  const pick = (label: string, next: string[]) => {
    const start = text.search(new RegExp(`${label}\\s*:`));
    if (start < 0) return null;
    const after = text.slice(start).replace(new RegExp(`^${label}\\s*:`), "");
    const ends = next.map((n) => after.search(new RegExp(`${n}\\s*:`))).filter((i) => i >= 0);
    return (ends.length ? after.slice(0, Math.min(...ends)) : after).trim();
  };
  const lines = (block: string | null) =>
    (block ?? "")
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-•·]|\d+[.)])\s*/, "").trim())
      .filter((l) => l.length > 1)
      .slice(0, 5)
      .map((l) => l.slice(0, 200));

  const diagnosis = (pick("진단", ["영업 방향", "이번 주 할 일"]) ?? "").split("\n").join(" ").trim().slice(0, 300);
  const strategy = lines(pick("영업 방향", ["이번 주 할 일"]));
  const actions = lines(pick("이번 주 할 일", []));
  if (!diagnosis || strategy.length === 0 || actions.length === 0) return null;
  return { diagnosis, strategy, actions };
}

/** 저장된 값이 화면에 그릴 수 있는 조언 모양인지 (문자열·문자열 배열, 길이 제한) */
export function isAdvice(v: unknown): v is Advice {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  const list = (x: unknown) => Array.isArray(x) && x.length > 0 && x.length <= 5 && x.every((s) => typeof s === "string" && s.length <= 200);
  return typeof a.diagnosis === "string" && a.diagnosis.length > 0 && a.diagnosis.length <= 300 && list(a.strategy) && list(a.actions);
}

/** 모델이 없거나 실패했을 때 — 같은 신호로 규칙 기반 코칭 */
export function ruleBasedAdvice(s: CoachSignals): Advice {
  const has = (sig: string) => s.감지된신호.includes(sig);
  const notes = Object.values(s.최근90일_활동).reduce((a, b) => a + b, 0);

  const parts: string[] = [`${s.단계} 단계의 ${s.계약방식} 사업(규모 ${s.규모구간})입니다.`];
  if (s.상태 !== "진행") parts.push(`현재 ${s.상태} 상태입니다.`);
  else if (has("열린 이슈 있음") || has("기한 지난 업무 있음")) parts.push("해결되지 않은 이슈·밀린 업무가 있어 먼저 정리가 필요합니다.");
  else if (has("활동 정체")) parts.push(`마지막 활동이 ${s.마지막활동_며칠전}일 전으로 관심이 식고 있을 수 있습니다.`);
  else parts.push("큰 위험 신호 없이 진행 중입니다.");

  const strategy: string[] = [];
  const early = ["발굴", "견적", "제안"].includes(s.단계);
  if (early) strategy.push("예산·일정·의사결정 구조(누가 최종 결정하는지)를 먼저 확인해 성사 가능성을 판단하세요.");
  if (s.단계 === "협상") strategy.push("가격만 낮추기보다 납기·유지보수 조건을 묶어 협상 여지를 만드세요.");
  if (s.계약방식 === "경쟁입찰" && ["제안", "협상", "입찰"].includes(s.단계)) strategy.push("규격·평가 기준을 다시 확인하고 경쟁사 대비 차별점을 제안서 첫 장에 두세요.");
  if (has("고객 접점이 한 사람에 몰림") || (early && s.최근90일_고객측상대_수 <= 1)) strategy.push("실무자 외에 의사결정자·구매 담당까지 접점을 넓히세요.");
  if (has("GP율 낮음")) strategy.push("매입처 단가·구성을 다시 협의해 마진을 확보하세요.");
  if (["수주", "이행", "빌링"].includes(s.단계)) strategy.push("일정대로 납품·검수를 마치고 후속 사업(확장·유지보수) 가능성을 함께 타진하세요.");
  if (strategy.length === 0) strategy.push("다음 단계로 넘어가기 위한 고객의 조건을 확인하고 일정으로 잡아 두세요.");

  const actions: string[] = [];
  if (has("열린 이슈 있음")) actions.push("열린 이슈의 해결 담당·기한을 정해 고객과 공유");
  if (has("기한 지난 업무 있음")) actions.push("기한 지난 업무를 완료 처리하거나 새 일정으로 변경");
  if (has("3일 안에 기한인 업무 있음")) actions.push("이번 주 기한 업무 준비물 점검");
  if (has("수주 후 필수 일정(배송·계산서) 미등록")) actions.push("배송·계산서 일정을 추적 업무로 등록");
  if (has("활동 정체") || notes === 0) actions.push("고객 담당자에게 근황 확인 연락 후 활동 기록 남기기");
  if (has("규모·GP 정보 빈칸")) actions.push("사업 규모·GP 입력 (예측 정확도)");
  if (actions.length < 2) actions.push("다음 미팅 일정을 잡고 안건을 미리 공유");

  return { diagnosis: parts.join(" "), strategy: strategy.slice(0, 3), actions: actions.slice(0, 4) };
}
