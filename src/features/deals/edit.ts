// 상세 패널 '핵심 정보' 수정 입력 → deals 갱신 값. 순수 함수 (테스트: edit.test.ts)
import type { DealStage } from "./types";
import { checkGp, parseWon } from "./money";

export const MONEY_HINT = "숫자로 입력하세요 (예: 15,000,000 또는 1500만, 1.5억).";

export type DealInfoInput = {
  name: string;
  amount: string;
  gp: string;
  contractType: string;
  periodStart: string;
  periodEnd: string;
  items: string;
};

export type DealInfoPatch = {
  name: string;
  amount: number | null;
  gp: number | null;
  contract_type: "competitive" | "negotiated";
  period_start: string | null;
  period_end: string | null;
  items: string | null;
};

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function toDealInfoPatch(
  input: DealInfoInput,
  stage: DealStage,
): { ok: true; patch: DealInfoPatch } | { ok: false; fieldErrors: Record<string, string> } {
  const e: Record<string, string> = {};
  const name = input.name.trim();
  const amount = parseWon(input.amount);
  const gp = parseWon(input.gp, { allowNegative: true });
  const start = input.periodStart.trim();
  const end = input.periodEnd.trim();

  if (!name) e.name = "사업명을 입력하세요.";
  // 등록과 같이 규모·GP 는 비울 수 없다 (파이프라인 예측·GP율이 빈 값 없이 나오게)
  if (!amount.ok) e.amount = MONEY_HINT;
  else if (amount.value == null) e.amount = "사업 규모를 입력하세요.";
  if (!gp.ok) e.gp = MONEY_HINT;
  else if (gp.value == null) e.gp = "GP를 입력하세요. (모르면 0)";
  else if (amount.ok) {
    const gpError = checkGp(amount.value, gp.value);
    if (gpError) e.gp = gpError;
  }
  if (input.contractType !== "competitive" && input.contractType !== "negotiated") e.contractType = "계약 방식을 고르세요.";
  else if (stage === "bidding" && input.contractType !== "competitive") e.contractType = "'입찰' 단계 사업은 경쟁입찰이어야 합니다.";
  if (start && !isDate(start)) e.periodStart = "날짜 형식이 올바르지 않습니다.";
  if (end && !isDate(end)) e.periodEnd = "날짜 형식이 올바르지 않습니다.";
  if (start && end && end < start) e.periodEnd = "종료일은 시작일 이후여야 합니다.";
  if (Object.keys(e).length || !amount.ok || !gp.ok) return { ok: false, fieldErrors: e };

  return {
    ok: true,
    patch: {
      name,
      amount: amount.value,
      gp: gp.value,
      contract_type: input.contractType as DealInfoPatch["contract_type"],
      period_start: start || null,
      period_end: end || null,
      items: input.items.trim() || null,
    },
  };
}
