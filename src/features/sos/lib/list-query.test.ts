import { describe, expect, it } from "vitest";
import { listHref, parseListQuery } from "./list-query";

describe("목록 주소 조건", () => {
  it("알 수 없는 값은 버린다", () => {
    expect(parseListQuery({ view: "x", status: ["new", "bad"], min: "abc", due: "5", team: " " })).toEqual({
      team: null,
      view: "deal",
      status: ["new"],
      minScore: undefined,
      deadlineWithin: undefined,
    });
  });

  it("허용된 값만 읽는다", () => {
    expect(parseListQuery({ view: "org", status: "on_hold", min: "50", due: "7", team: "t1" })).toEqual({
      team: "t1",
      view: "org",
      status: ["on_hold"],
      minScore: 50,
      deadlineWithin: 7,
    });
  });

  it("주소는 기본값을 빼고 만든다", () => {
    const q = parseListQuery({ team: "t1", status: ["new", "reviewing"] });
    expect(listHref(q, { view: "org" })).toBe("/sos?team=t1&view=org&status=new&status=reviewing");
    expect(listHref(parseListQuery({}), {})).toBe("/sos");
  });
});
