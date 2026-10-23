import { describe, expect, it } from "vitest";
import {
  ADD_MAX,
  describeChange,
  diffKeyword,
  parseChangeId,
  parseKeywordPatch,
  parseProductInput,
  parseTeamSettingsPatch,
  planAddKeywords,
  planRevert,
  type KeywordSnapshot,
} from "./keyword-edit";

const P1 = "0b6f3c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const P2 = "1b6f3c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

const kw: KeywordSnapshot = { term: "IBM", tier: "core", weight: null, active: true, productIds: [P2, P1] };

describe("키워드 수정 입력 검증", () => {
  it("칸·가중치·켜기·연결 제품만 받는다", () => {
    expect(parseKeywordPatch({ tier: "extended", weight: 5, active: false, productIds: [P2, P1, P2] })).toEqual({
      ok: true,
      patch: { tier: "extended", weight: 5, active: false, productIds: [P1, P2] },
    });
    expect(parseKeywordPatch({ weight: null })).toEqual({ ok: true, patch: { weight: null } });
    expect(parseKeywordPatch({ weight: 0 })).toEqual({ ok: true, patch: { weight: 0 } });
    expect(parseKeywordPatch({ productIds: [] })).toEqual({ ok: true, patch: { productIds: [] } });
  });

  it("범위 밖·모양이 틀린 값·빈 요청은 거절", () => {
    expect(parseKeywordPatch({ tier: "hot" }).ok).toBe(false);
    expect(parseKeywordPatch({ weight: 11 }).ok).toBe(false);
    expect(parseKeywordPatch({ weight: -1 }).ok).toBe(false);
    expect(parseKeywordPatch({ weight: 2.5 }).ok).toBe(false);
    expect(parseKeywordPatch({ weight: "3" }).ok).toBe(false);
    expect(parseKeywordPatch({ active: "yes" }).ok).toBe(false);
    expect(parseKeywordPatch({ productIds: ["x"] }).ok).toBe(false);
    expect(parseKeywordPatch({ productIds: "x" }).ok).toBe(false);
    expect(parseKeywordPatch({ term: "바꿈" }).ok).toBe(false);
    expect(parseKeywordPatch({}).ok).toBe(false);
    expect(parseKeywordPatch(null).ok).toBe(false);
  });
});

describe("변경 이력 before/after", () => {
  it("바뀐 칸만 남긴다 (제품은 순서 무시)", () => {
    expect(diffKeyword(kw, { tier: "extended", weight: null, productIds: [P1, P2] })).toEqual({
      before: { tier: "core" },
      after: { tier: "extended" },
    });
    expect(diffKeyword(kw, { weight: 7, active: false, productIds: [P1] })).toEqual({
      before: { weight: null, active: true, productIds: [P1, P2] },
      after: { weight: 7, active: false, productIds: [P1] },
    });
  });

  it("바뀐 것이 없으면 null", () => {
    expect(diffKeyword(kw, { tier: "core", productIds: [P1, P2] })).toBeNull();
  });
});

describe("키워드 여러 개 추가", () => {
  it("쉼표·줄바꿈으로 나누고 이미 있는 것은 따로 알려 준다 (대소문자 무시)", () => {
    expect(planAddKeywords("IBM, 스토리지\n서버", ["ibm"])).toEqual({ ok: true, fresh: ["스토리지", "서버"], duplicates: ["IBM"] });
  });

  it("빈 입력·너무 긴 키워드·너무 많은 키워드는 거절", () => {
    expect(planAddKeywords(" , ", []).ok).toBe(false);
    expect(planAddKeywords("가".repeat(51), []).ok).toBe(false);
    expect(planAddKeywords(Array.from({ length: ADD_MAX + 1 }, (_, i) => `k${i}`).join(","), []).ok).toBe(false);
    expect(planAddKeywords(3 as unknown as string, []).ok).toBe(false);
  });
});

describe("되돌리기 계획", () => {
  const live = { deleted: false };
  const gone = { deleted: true };

  it("추가·복구는 삭제로, 삭제는 복구로", () => {
    expect(planRevert({ action: "create", before: null, after: { term: "IBM", tier: "core" } }, live)).toEqual({ kind: "delete" });
    expect(planRevert({ action: "restore", before: null, after: { term: "IBM" } }, live)).toEqual({ kind: "delete" });
    expect(planRevert({ action: "delete", before: { term: "IBM" }, after: null }, gone)).toEqual({ kind: "restore" });
  });

  it("수정은 before 값으로 되돌린다", () => {
    expect(
      planRevert({ action: "update", before: { tier: "core", weight: null, productIds: [P2] }, after: { tier: "extended", weight: 3, productIds: [] } }, live),
    ).toEqual({ kind: "update", patch: { tier: "core", weight: null, productIds: [P2] } });
  });

  it("이미 그 상태이거나 키워드가 없으면 오류", () => {
    expect(planRevert({ action: "create", before: null, after: {} }, gone).kind).toBe("error");
    expect(planRevert({ action: "delete", before: {}, after: null }, live).kind).toBe("error");
    expect(planRevert({ action: "update", before: { tier: "core" }, after: { tier: "exclude" } }, gone).kind).toBe("error");
    expect(planRevert({ action: "update", before: { term: "x" }, after: {} }, live).kind).toBe("error");
    expect(planRevert({ action: "update", before: { tier: "core" }, after: {} }, null).kind).toBe("error");
  });
});

describe("변경 이력 문구", () => {
  it("동작과 바뀐 칸을 글자로", () => {
    expect(describeChange({ action: "create", before: null, after: { term: "IBM", tier: "core" } })).toBe("추가 · 핵심");
    expect(describeChange({ action: "delete", before: { term: "IBM", tier: "exclude" }, after: null })).toBe("삭제 · 제외");
    expect(describeChange({ action: "restore", before: null, after: { term: "IBM", tier: "core" } })).toBe("복구 · 핵심");
    expect(
      describeChange({
        action: "update",
        before: { tier: "core", weight: null, active: true, productIds: [P1] },
        after: { tier: "extended", weight: 5, active: false, productIds: [P1, P2] },
      }),
    ).toBe("칸 핵심 → 확장 · 가중치 기본 → 5 · 끔 · 연결 제품 1개 → 2개");
    expect(describeChange({ action: "update", before: { active: false }, after: { active: true } })).toBe("켬");
  });
});

describe("부문 설정 입력 검증", () => {
  it("D-n 1~14, AI 요약 0~10 정수만", () => {
    expect(parseTeamSettingsPatch({ prespecAlertDays: 7, aiSummaryTopN: 0 })).toEqual({
      ok: true,
      patch: { prespec_alert_days: 7, ai_summary_top_n: 0 },
    });
    expect(parseTeamSettingsPatch({ aiSummaryTopN: 10 })).toEqual({ ok: true, patch: { ai_summary_top_n: 10 } });
    expect(parseTeamSettingsPatch({ prespecAlertDays: 0 }).ok).toBe(false);
    expect(parseTeamSettingsPatch({ prespecAlertDays: 15 }).ok).toBe(false);
    expect(parseTeamSettingsPatch({ aiSummaryTopN: 11 }).ok).toBe(false);
    expect(parseTeamSettingsPatch({ aiSummaryTopN: 1.5 }).ok).toBe(false);
    expect(parseTeamSettingsPatch({}).ok).toBe(false);
    expect(parseTeamSettingsPatch("x").ok).toBe(false);
  });
});

describe("제품·이력 id 입력", () => {
  it("제품 이름은 필수, 공급사는 비우면 null", () => {
    expect(parseProductInput({ name: "  IBM  Vault ", vendor: " " })).toEqual({ ok: true, value: { name: "IBM Vault", vendor: null } });
    expect(parseProductInput({ name: "EDR", vendor: "안랩" })).toEqual({ ok: true, value: { name: "EDR", vendor: "안랩" } });
    expect(parseProductInput({ name: "  " }).ok).toBe(false);
    expect(parseProductInput({ name: "가".repeat(101) }).ok).toBe(false);
    expect(parseProductInput(null).ok).toBe(false);
  });

  it("이력 id 는 양의 정수만", () => {
    expect(parseChangeId(12)).toBe(12);
    expect(parseChangeId(0)).toBeNull();
    expect(parseChangeId(1.5)).toBeNull();
    expect(parseChangeId("12")).toBeNull();
  });
});
