import { describe, expect, it } from "vitest";
import { DEFAULT_PIPELINE_SETTINGS, fromSettingsRow, parseSettingsInput, STAGES } from "./pipeline-settings";

describe("fromSettingsRow", () => {
  it("행이 없으면 기본값", () => {
    expect(fromSettingsRow(null)).toEqual(DEFAULT_PIPELINE_SETTINGS);
  });
  it("있는 칸만 덮고, 이상한 값은 무시", () => {
    const s = fromSettingsRow({ stage_probabilities: { proposal: 55, quoting: 150, negotiation: "70", hacked: 1 }, stale_after_days: 21 });
    expect(s.probabilities).toMatchObject({ proposal: 55, quoting: 20, negotiation: 60, discovery: 10 });
    expect(s.probabilities).not.toHaveProperty("hacked");
    expect(s.staleAfterDays).toBe(21);
    expect(fromSettingsRow({ stage_probabilities: null, stale_after_days: 500 }).staleAfterDays).toBe(14);
  });
});

describe("parseSettingsInput", () => {
  const full = Object.fromEntries(STAGES.map((s) => [s, "50"]));
  it("모든 단계 0~100 정수 + 정체 3~90일", () => {
    expect(parseSettingsInput({ probabilities: full, staleAfterDays: "10" })).toMatchObject({ ok: true, value: { stale_after_days: 10, stage_probabilities: { won: 50 } } });
  });
  it("빈 칸·범위 밖·소수 거부", () => {
    expect(parseSettingsInput({ probabilities: { ...full, won: "" }, staleAfterDays: "10" }).ok).toBe(false);
    expect(parseSettingsInput({ probabilities: { ...full, won: "101" }, staleAfterDays: "10" }).ok).toBe(false);
    expect(parseSettingsInput({ probabilities: { ...full, won: "5.5" }, staleAfterDays: "10" }).ok).toBe(false);
    expect(parseSettingsInput({ probabilities: full, staleAfterDays: "2" }).ok).toBe(false);
  });
});
