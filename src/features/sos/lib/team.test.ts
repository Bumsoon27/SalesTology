import { describe, expect, it } from "vitest";
import { resolveSosTeam } from "./team";

const T = ["t1", "t2"];

describe("resolveSosTeam", () => {
  it("member 는 요청값을 무시하고 자기 부문", () => {
    expect(resolveSosTeam({ role: "member", teamId: "t1" }, "t2", T)).toEqual({ ok: true, teamId: "t1", isAdminView: false });
    expect(resolveSosTeam({ role: "member", teamId: null }, null, T).ok).toBe(false);
  });
  it("admin 은 존재하는 부문만 선택", () => {
    expect(resolveSosTeam({ role: "admin", teamId: null }, "t2", T)).toEqual({ ok: true, teamId: "t2", isAdminView: true });
    expect(resolveSosTeam({ role: "admin", teamId: null }, "zzz", T).ok).toBe(false);
    expect(resolveSosTeam({ role: "admin", teamId: null }, null, T).ok).toBe(false);
  });
  it("admin 이 자기 부문이 있고 요청이 없으면 자기 부문", () => {
    expect(resolveSosTeam({ role: "admin", teamId: "t1" }, null, T)).toEqual({ ok: true, teamId: "t1", isAdminView: false });
  });
});
