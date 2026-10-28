import { describe, expect, it } from "vitest";
import { evaluateStatus, tokenCheck } from "./system-status";

const today = "2026-10-28";
const env = { secretKey: true, naver: true, aiCoach: null, gemini: false, dataGoKr: true };

describe("tokenCheck", () => {
  it("만료일 없음·지남·14일 이내·여유", () => {
    expect(tokenCheck(null, today).state).toBe("warn");
    expect(tokenCheck("2026-10-27", today)).toMatchObject({ state: "error", detail: expect.stringContaining("1일 전") });
    expect(tokenCheck("2026-11-05", today)).toMatchObject({ state: "warn", detail: expect.stringContaining("8일 뒤") });
    expect(tokenCheck("2026-10-28", today).detail).toContain("오늘");
    expect(tokenCheck("2027-10-28", today).state).toBe("ok");
  });
});

describe("evaluateStatus", () => {
  it("운영 DB 가 코드보다 뒤처지면 오류, 같거나 앞이면 정상", () => {
    const behind = evaluateStatus({ today, buildMigration: "20261028120000", dbMigration: "20261028100000", tokenExpiresOn: "2027-01-01", env });
    expect(behind.find((c) => c.id === "migration")?.state).toBe("error");
    const same = evaluateStatus({ today, buildMigration: "20261028120000", dbMigration: "20261028120000", tokenExpiresOn: "2027-01-01", env });
    expect(same.find((c) => c.id === "migration")?.state).toBe("ok");
    expect(evaluateStatus({ today, buildMigration: "", dbMigration: null, tokenExpiresOn: null, env }).find((c) => c.id === "migration")?.state).toBe("warn");
  });

  it("환경변수는 있음/없음만, 선택 기능은 '꺼짐'", () => {
    const c = evaluateStatus({ today, buildMigration: "1", dbMigration: "1", tokenExpiresOn: null, env: { ...env, secretKey: false, naver: false } });
    expect(c.find((x) => x.id === "secret")?.state).toBe("error");
    expect(c.find((x) => x.id === "naver")?.state).toBe("off");
    expect(c.find((x) => x.id === "coach")?.detail).toContain("규칙 기반");
  });
});
