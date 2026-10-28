import { describe, expect, it } from "vitest";
import { isAdvice, parseAdvice, ruleBasedAdvice, userPrompt } from "./advice";

describe("isAdvice", () => {
  it("저장된 값 모양 확인 — 깨진 값·예약 중 값은 거부", () => {
    expect(isAdvice({ diagnosis: "x", strategy: ["a"], actions: ["b"] })).toBe(true);
    expect(isAdvice({ pending: true })).toBe(false);
    expect(isAdvice({ diagnosis: "x", strategy: "a", actions: ["b"] })).toBe(false);
    expect(isAdvice({ diagnosis: "x", strategy: [1], actions: ["b"] })).toBe(false);
    expect(isAdvice(null)).toBe(false);
  });
});
import type { CoachSignals } from "./signals";

const signals = (o: Partial<CoachSignals> = {}): CoachSignals => ({
  단계: "제안",
  상태: "진행",
  계약방식: "경쟁입찰",
  규모구간: "1억~5억",
  GP율구간: "10~20%",
  마지막활동_며칠전: 3,
  계약기간_개월: 12,
  열린이슈_건수: 0,
  업무: [],
  관계사: "없음(직접 진행)",
  최근90일_활동: { 미팅: 1 },
  최근90일_고객측상대_수: 2,
  감지된신호: [],
  ...o,
});

describe("parseAdvice", () => {
  const good = "진단: 제안 단계에서 순조롭습니다.\n영업 방향:\n- 평가 기준 확인\n- 의사결정자 접촉\n이번 주 할 일:\n1. 제안 피드백 요청\n2) 다음 미팅 잡기";

  it("형식대로 나눈다 (목록 기호·번호 제거)", () => {
    expect(parseAdvice(good)).toEqual({
      diagnosis: "제안 단계에서 순조롭습니다.",
      strategy: ["평가 기준 확인", "의사결정자 접촉"],
      actions: ["제안 피드백 요청", "다음 미팅 잡기"],
    });
  });

  it("마크다운 기호는 지우고 받는다", () => {
    expect(parseAdvice(good.replace("진단:", "**진단:**"))?.diagnosis).toBe("제안 단계에서 순조롭습니다.");
  });

  it("형식이 안 맞거나 링크·HTML·너무 긴 응답은 거부", () => {
    expect(parseAdvice("좋은 사업입니다.")).toBeNull();
    expect(parseAdvice(`${good}\n- 자세히: https://evil.example`)).toBeNull();
    expect(parseAdvice(`${good}\n<script>x</script>`)).toBeNull();
    expect(parseAdvice(good + "가".repeat(2000))).toBeNull();
    expect(parseAdvice("진단: 괜찮음\n영업 방향:\n이번 주 할 일:\n- x")).toBeNull();
  });
});

describe("ruleBasedAdvice", () => {
  it("신호에 맞춰 진단·방향·할 일을 만든다", () => {
    const a = ruleBasedAdvice(signals({ 감지된신호: ["열린 이슈 있음", "고객 접점이 한 사람에 몰림"] }));
    expect(a.diagnosis).toContain("이슈");
    expect(a.strategy.join(" ")).toContain("의사결정자");
    expect(a.actions[0]).toContain("이슈");
    expect(a.strategy.length).toBeLessThanOrEqual(3);
    expect(a.actions.length).toBeGreaterThanOrEqual(2);
  });

  it("수주 이후는 이행·후속 사업 방향", () => {
    expect(ruleBasedAdvice(signals({ 단계: "이행" })).strategy.join(" ")).toContain("후속 사업");
  });
});

describe("userPrompt", () => {
  it("신호 JSON 만 담는다", () => {
    expect(userPrompt(signals())).toContain('"단계": "제안"');
  });
});
