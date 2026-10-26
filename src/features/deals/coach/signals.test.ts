import { describe, expect, it } from "vitest";
import { amountBand, buildCoachSignals, gpRateBand, signalsKey, type CoachInput } from "./signals";

const today = "2026-10-26";
const input = (o: Partial<CoachInput> = {}): CoachInput => ({
  stage: "proposal",
  status: "active",
  contractType: "competitive",
  amount: 280_000_000,
  gp: 28_000_000,
  lastActivityAt: "2026-10-20T03:00:00Z",
  periodStart: "2026-07-01",
  periodEnd: "2027-06-30",
  tasks: [
    { id: "t1", type: "delivery", title: null, company_id: "c-hanbit", due_date: "2026-10-24", done_at: null, excluded_reason: null },
    { id: "t2", type: "custom", title: "한빛은행 김부장 보고", company_id: null, due_date: null, done_at: null, excluded_reason: null },
  ],
  issues: [{ id: "i1", title: "한빛은행 납기 지연 우려", status: "open" }],
  parties: [{ role: "si" }],
  notes: [
    { kind: "meeting", occurredOn: "2026-10-20", counterpart: "김부장(전산팀)" },
    { kind: "call", occurredOn: "2026-10-10", counterpart: "김부장(전산팀)" },
  ],
  staleAfterDays: 14,
  ...o,
});

describe("buildCoachSignals", () => {
  it("이름·본문·정확한 금액·날짜를 보내지 않는다", () => {
    const text = JSON.stringify(buildCoachSignals(input(), today));
    for (const leak of ["한빛", "김부장", "전산팀", "납기 지연", "보고", "280000000", "28000000", "2026-", "c-hanbit"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("구간·상태·횟수로 요약한다", () => {
    const s = buildCoachSignals(input(), today);
    expect(s).toMatchObject({
      단계: "제안",
      계약방식: "경쟁입찰",
      규모구간: "1억~5억",
      GP율구간: "10~20%",
      마지막활동_며칠전: 6,
      계약기간_개월: 12,
      열린이슈_건수: 1,
      관계사: "매출처(SI) 1곳, 매입처 0곳",
      최근90일_활동: { 미팅: 1, 통화: 1 },
      최근90일_고객측상대_수: 1,
    });
    expect(s.업무).toEqual(["배송: 기한 2일 지남", "기타 업무: 일정 미정"]);
    expect(s.감지된신호).toEqual(expect.arrayContaining(["열린 이슈 있음", "기한 지난 업무 있음", "고객 접점이 한 사람에 몰림"]));
  });

  it("구간 경계", () => {
    expect([amountBand(null), amountBand(29_999_999), amountBand(100_000_000), amountBand(1_000_000_000)]).toEqual(["미입력", "3천만 미만", "1억~5억", "10억 이상"]);
    expect([gpRateBand(100, null), gpRateBand(100, -1), gpRateBand(100, 4), gpRateBand(100, 50)]).toEqual(["미입력", "손실", "5% 미만", "40% 이상"]);
  });

  it("같은 신호면 같은 캐시 키", () => {
    expect(signalsKey(buildCoachSignals(input(), today))).toBe(signalsKey(buildCoachSignals(input(), today)));
    expect(signalsKey(buildCoachSignals(input(), today))).not.toBe(signalsKey(buildCoachSignals(input({ stage: "negotiation" }), today)));
    // 중첩 값(활동 횟수)이 바뀌어도 키가 바뀐다
    const more = input({ notes: [...input().notes, { kind: "email", occurredOn: "2026-10-25", counterpart: null }] });
    expect(signalsKey(buildCoachSignals(input(), today))).not.toBe(signalsKey(buildCoachSignals(more, today)));
  });
});
