// 상세 패널 '핵심 정보' 수정 입력 → deals 갱신 값. 순수 함수 (테스트: edit.test.ts)
import type { DealStage } from "./types";

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

const money = (s: string) => s.replace(/[,\s원]/g, "");
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export function toDealInfoPatch(
  input: DealInfoInput,
  stage: DealStage,
): { ok: true; patch: DealInfoPatch } | { ok: false; fieldErrors: Record<string, string> } {
  const e: Record<string, string> = {};
  const name = input.name.trim();
  const amount = money(input.amount);
  const gp = money(input.gp);
  const start = input.periodStart.trim();
  const end = input.periodEnd.trim();

  if (!name) e.name = "사업명을 입력하세요.";
  if (amount && !/^\d+$/.test(amount)) e.amount = "숫자만 입력하세요.";
  if (gp && !/^-?\d+$/.test(gp)) e.gp = "숫자만 입력하세요.";
  if (input.contractType !== "competitive" && input.contractType !== "negotiated") e.contractType = "계약 방식을 고르세요.";
  else if (stage === "bidding" && input.contractType !== "competitive") e.contractType = "'입찰' 단계 사업은 경쟁입찰이어야 합니다.";
  if (start && !isDate(start)) e.periodStart = "날짜 형식이 올바르지 않습니다.";
  if (end && !isDate(end)) e.periodEnd = "날짜 형식이 올바르지 않습니다.";
  if (start && end && end < start) e.periodEnd = "종료일은 시작일 이후여야 합니다.";
  if (Object.keys(e).length) return { ok: false, fieldErrors: e };

  return {
    ok: true,
    patch: {
      name,
      amount: amount ? Number(amount) : null,
      gp: gp ? Number(gp) : null,
      contract_type: input.contractType as DealInfoPatch["contract_type"],
      period_start: start || null,
      period_end: end || null,
      items: input.items.trim() || null,
    },
  };
}
