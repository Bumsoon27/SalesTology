// 사업 목록 → CSV (엑셀에서 바로 열리게 UTF-8 BOM). 순수 함수 (테스트: csv.test.ts)
//
// 보안: 셀이 = + - @ 탭·CR 로 시작하면 엑셀이 수식으로 실행할 수 있다(CSV 인젝션) → 앞에 ' 를 붙여 글자로만 보이게.
// 단, 숫자 칸(금액)은 숫자 그대로 둔다 (음수 GP 도 숫자).
import { STAGE_LABEL, type DealStage, type DealStatus } from "@/features/deals/types";

const STATUS_KO: Record<DealStatus, string> = { active: "진행", on_hold: "보류", lost: "실주", closed: "종결" };

export type ExportDeal = {
  name: string;
  customer: string;
  owner: string;
  stage: DealStage;
  status: DealStatus;
  contractType: "competitive" | "negotiated";
  amount: number | null;
  gp: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  si: string[];
  suppliers: string[];
  lastActivityOn: string;
  fromSos: boolean;
};

/** 문자열 칸: 수식 시작 문자 무력화 + 따옴표·쉼표·줄바꿈 이스케이프 */
export function textCell(v: string | null | undefined): string {
  let s = (v ?? "").replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const numCell = (n: number | null) => (n == null || !Number.isFinite(n) ? "" : String(Math.round(n)));

export const HEADERS = ["사업명", "고객사", "영업대표", "단계", "상태", "계약 방식", "사업 규모(원)", "GP(원)", "GP율(%)", "계약 시작", "계약 종료", "매출처(SI)", "매입처", "마지막 활동", "출처"];

export function dealsToCsv(rows: ExportDeal[]): string {
  const lines = [HEADERS.map(textCell).join(",")];
  for (const r of rows) {
    const rate = r.amount && r.gp != null ? Math.round((r.gp / r.amount) * 1000) / 10 : null;
    lines.push(
      [
        textCell(r.name),
        textCell(r.customer),
        textCell(r.owner),
        textCell(STAGE_LABEL[r.stage]),
        textCell(STATUS_KO[r.status]),
        textCell(r.contractType === "competitive" ? "경쟁입찰" : "수의계약"),
        numCell(r.amount),
        numCell(r.gp),
        rate == null ? "" : String(rate),
        textCell(r.periodStart),
        textCell(r.periodEnd),
        textCell(r.si.join(" / ")),
        textCell(r.suppliers.join(" / ")),
        textCell(r.lastActivityOn),
        textCell(r.fromSos ? "SOS" : ""),
      ].join(","),
    );
  }
  // BOM: 엑셀이 UTF-8 로 읽게 (한글 깨짐 방지)
  return `﻿${lines.join("\r\n")}\r\n`;
}
