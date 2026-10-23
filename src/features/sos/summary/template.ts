import type { DeadlineType } from "../types";

export type TemplateInput = {
  orgName: string;
  title: string;
  orderMonth: string | null;
  budget: number | null;
  nextDeadlineType: DeadlineType | null;
  daysLeft: number | null;
  keywords: string[];
  orgSignals: number;
};

const DEADLINE_LABEL: Record<DeadlineType, string> = {
  prespec_opinion: "사전규격 의견 마감",
  bid_close: "입찰 마감",
};

// 읽을 때 받침이 있는 숫자: 영·일·삼·육·칠·팔
const DIGITS_WITH_BATCHIM = new Set(["0", "1", "3", "6", "7", "8"]);
// 영문 끝 글자를 한 자씩 읽을 때 받침이 있는 것: 엘·엠·엔·알 ("한전KDN이", "LG가")
const LETTERS_WITH_BATCHIM = new Set(["l", "m", "n", "r"]);

function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return DIGITS_WITH_BATCHIM.has(ch) || LETTERS_WITH_BATCHIM.has(ch.toLowerCase());
}

const subject = (w: string) => `${w}${hasBatchim(w) ? "이" : "가"}`;
const object = (w: string) => `${w}${hasBatchim(w) ? "을" : "를"}`;

/** 금액을 영업용 표기로 줄인다. 값이 없으면 "미공개". */
export function formatWon(n: number | null): string {
  if (n === null) return "미공개";
  // 만 단위로 반올림해 1만만(=1억)이 되는 값도 억으로 올린다
  if (n >= 100_000_000 || Math.round(n / 10_000) >= 10_000) {
    const eok = Math.round((n / 100_000_000) * 10) / 10;
    return `${eok.toLocaleString("en-US", { maximumFractionDigits: 1 })}억`;
  }
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString("en-US")}만`;
  return `${n.toLocaleString("en-US")}원`;
}

function formatMonth(ym: string): string | null {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}월` : null;
}

/** AI 요약을 못 쓸 때의 고정 문장. */
export function templateSummary(l: TemplateInput): string {
  const month = l.orderMonth ? formatMonth(l.orderMonth) : null;
  let s = `${subject(l.orgName)} ${month ? `${month}에 ` : ""}${object(l.title)} 발주할 예정입니다.`;
  if (l.budget !== null) s += ` 예산 ${formatWon(l.budget)}.`;
  if (l.nextDeadlineType && l.daysLeft !== null) s += ` ${DEADLINE_LABEL[l.nextDeadlineType]} D-${l.daysLeft}.`;
  if (l.keywords.length > 0) s += ` 일치 키워드: ${l.keywords.join(", ")}.`;
  if (l.orgSignals > 0) s += ` 같은 기관 시그널 ${l.orgSignals}건.`;
  return s;
}
