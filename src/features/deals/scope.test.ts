import { describe, expect, it } from "vitest";
import { resolveScope, scopeHref } from "./scope";

const user = { id: "me", teamId: "t1" };
const members = [
  { id: "me", name: "관리자" },
  { id: "dj", name: "서동준" },
];

describe("resolveScope", () => {
  it("기본은 개인", () => {
    expect(resolveScope({}, user, members)).toEqual({ kind: "mine" });
    expect(resolveScope({ scope: "x" }, user, members)).toEqual({ kind: "mine" });
  });

  it("부문 전체·특정 영업대표, 내 id 면 개인", () => {
    expect(resolveScope({ scope: "team" }, user, members)).toEqual({ kind: "team" });
    expect(resolveScope({ scope: "team", owner: "dj" }, user, members)).toEqual({ kind: "member", id: "dj", name: "서동준" });
    expect(resolveScope({ scope: "team", owner: "me" }, user, members)).toEqual({ kind: "mine" });
  });

  it("요청값을 믿지 않는다 — 부문 없는 사용자는 개인, 모르는 owner 는 부문 전체", () => {
    expect(resolveScope({ scope: "team" }, { id: "admin", teamId: null }, members)).toEqual({ kind: "mine" });
    expect(resolveScope({ scope: "team", owner: "other-team-user" }, user, members)).toEqual({ kind: "team" });
    expect(resolveScope({ scope: ["team", "x"], owner: ["dj"] }, user, members)).toEqual({ kind: "member", id: "dj", name: "서동준" });
  });
});

describe("scopeHref", () => {
  it("주소 만들기", () => {
    expect(scopeHref("/dashboard", { kind: "mine" })).toBe("/dashboard");
    expect(scopeHref("/pipeline", { kind: "team" })).toBe("/pipeline?scope=team");
    expect(scopeHref("/pipeline", { kind: "member", id: "a b" })).toBe("/pipeline?scope=team&owner=a%20b");
  });
});
