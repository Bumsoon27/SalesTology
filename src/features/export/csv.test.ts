import { describe, expect, it } from "vitest";
import { dealsToCsv, HEADERS, textCell, type ExportDeal } from "./csv";

const row = (o: Partial<ExportDeal> = {}): ExportDeal => ({
  name: "차세대 서버",
  customer: "한빛은행",
  owner: "김영업",
  stage: "proposal",
  status: "active",
  contractType: "competitive",
  amount: 150_000_000,
  gp: 15_000_000,
  periodStart: "2026-07-01",
  periodEnd: null,
  si: ["LGCNS", "코비엔"],
  suppliers: [],
  lastActivityOn: "2026-10-27",
  fromSos: false,
  ...o,
});

describe("textCell", () => {
  it("수식으로 실행될 수 있는 시작 문자는 글자로 (CSV 인젝션 방지)", () => {
    expect(textCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(textCell("+1")).toBe("'+1");
    expect(textCell("-2")).toBe("'-2");
    expect(textCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
  it("쉼표·따옴표·줄바꿈은 감싼다, 평범한 값·빈 값은 그대로", () => {
    expect(textCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(textCell("한빛은행")).toBe("한빛은행");
    expect(textCell(null)).toBe("");
  });
});

describe("dealsToCsv", () => {
  it("BOM + 머리글 + 행, 금액은 숫자, GP율 계산, 손실 GP 는 음수 숫자", () => {
    const csv = dealsToCsv([row(), row({ name: "손실", gp: -3_000_000, amount: 100_000_000, fromSos: true })]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe(HEADERS.join(","));
    expect(lines[1]).toBe("차세대 서버,한빛은행,김영업,제안,진행,경쟁입찰,150000000,15000000,10,2026-07-01,,LGCNS / 코비엔,,2026-10-27,,");
    expect(lines[2]).toContain(",100000000,-3000000,-3,");
    expect(lines[2].endsWith(",SOS,")).toBe(true);
    // 실주 사유는 실주 사업에만
    const lost = dealsToCsv([row({ status: "lost", lostReason: "price" }), row({ status: "active", lostReason: "price" })]).slice(1).trim().split("\r\n");
    expect(lost[1].endsWith(",가격")).toBe(true);
    expect(lost[2].endsWith(",")).toBe(true);
  });
});
